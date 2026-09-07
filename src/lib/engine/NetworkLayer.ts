import type {
	LayerInterface,
	IPPacket,
	ARPPacket,
	ICMPPacket,
	UDPDatagram,
	TCPSegment,
	ProtocolHandler
} from './types';
import type { ArpService } from './ArpService.svelte';
import { NetworkConfig } from './NetworkConfig.svelte';
import { isValidIPv4, isSameSubnet } from './helpers';

export class NetworkLayer implements LayerInterface {
	public config: NetworkConfig;
	public arpService: ArpService;
	public upperLayer?: LayerInterface;
	public lowerLayer?: LayerInterface;

	// Standardmäßig false (Host). Auf true setzen für Router/Interfaces mit Forwarding.
	public isForwardingEnabled: boolean = false;

	// Register protocol handlers for ICMP, UDP, and TCP
	private protocolHandlers = new Map<string, ProtocolHandler>();

	public registerProtocolHandler(protocol: 'ICMP' | 'UDP' | 'TCP', handler: ProtocolHandler): void {
		this.protocolHandlers.set(protocol, handler);
	}

	constructor(config: NetworkConfig, arpService: ArpService, isForwardingEnabled = false) {
		this.config = config;
		this.arpService = arpService;
		this.isForwardingEnabled = isForwardingEnabled;
	}

	public send(
		payload: ICMPPacket | UDPDatagram | TCPSegment,
		destinationIp: string,
		protocol: 'ICMP' | 'UDP' | 'TCP'
	): void {
		if (!this.lowerLayer) return;

		if (!isValidIPv4(destinationIp)) return;

		const isLocal = isSameSubnet(this.config.ipAddress, destinationIp, this.config.netmask);

		// Next-Hop bestimmen (Lokal -> Ziel-IP, Extern -> Gateway-IP)
		const nextHopIp = isLocal ? destinationIp : this.config.gateway;

		if (!nextHopIp) {
			console.warn(
				`[NetworkLayer] Kein Weg zu ${destinationIp} (Nicht lokal und kein Gateway gesetzt).`
			);
			return;
		}

		const ipPacket: IPPacket = {
			header: {
				srcIp: this.config.ipAddress,
				dstIp: destinationIp,
				protocol,
				ttl: 64 // Default TTL value
			},
			payload
		};

		// ARP löst den Next-Hop (Gateway) auf
		this.arpService.resolve(nextHopIp, ipPacket, (macAddress) => {
			this.lowerLayer?.send(ipPacket, macAddress, 'IP');
		});
	}

	public receive(packet: IPPacket | ARPPacket, type: 'IP' | 'ARP'): void {
		if (type === 'ARP') {
			this.arpService.handlePacket(packet as ARPPacket, (pendingPacket, mac) => {
				this.lowerLayer?.send(pendingPacket, mac, 'IP');
			});
			return;
		}

		// otherwise it's an IP packet
		const ipPacket = packet as IPPacket;

		// reduce ttl
		ipPacket.header.ttl--;

		const isForMe =
			ipPacket.header.dstIp === this.config.ipAddress ||
			ipPacket.header.dstIp === '255.255.255.255';

		if (isForMe) {
			const handler = this.protocolHandlers.get(ipPacket.header.protocol);
			if (handler) {
				handler.receive(ipPacket.payload, ipPacket.header.srcIp);
			}
		} else if (ipPacket.header.ttl <= 0) {
			// TTL abgelaufen -> ICMP Time-Exceeded senden
			this.sendIcmpError(ipPacket, 'time-exceeded');
			console.warn(
				`IP packet dropped due to TTL=0. Packet from ${ipPacket.header.srcIp} to ${ipPacket.header.dstIp}`
			);
		} else if (this.isForwardingEnabled) {
			// ROUTER-MODUS: Paket weiterleiten
			this.forward(ipPacket);
		} else {
			console.warn(
				`IP packet not for this device. Expected ${this.config.ipAddress}, got ${ipPacket.header.dstIp}`
			);
		}
	}

	/**
	 * Weiterleitungslogik für Router
	 */
	private forward(ipPacket: IPPacket): void {
		if (!this.lowerLayer) return;

		const destinationIp = ipPacket.header.dstIp;
		const isLocal = isSameSubnet(this.config.ipAddress, destinationIp, this.config.netmask);
		const nextHopIp = isLocal ? destinationIp : this.config.gateway;

		if (!nextHopIp) {
			// Kein Weg zum Ziel -> ICMP destination-unreachable zurück an Absender
			console.warn(`[NetworkLayer] Forwarding fehlgeschlagen: Kein Next-Hop für ${destinationIp}`);
			this.sendIcmpError(ipPacket, 'destination-unreachable');
			return;
		}

		console.log(`[NetworkLayer] Leite Paket für ${destinationIp} weiter an Next-Hop ${nextHopIp}`);

		// ARP-Auflösung für den Next-Hop durchführen und über Layer 2 aussenden
		this.arpService.resolve(nextHopIp, ipPacket, (macAddress) => {
			this.lowerLayer?.send(ipPacket, macAddress, 'IP');
		});
	}

	/**
	 * Hilfsmethode für das Senden von ICMP-Fehlermeldungen an den Absender
	 */
	private sendIcmpError(
		failedPacket: IPPacket,
		type: 'time-exceeded' | 'destination-unreachable'
	): void {
		// Schutz vor Endlosschleifen: Niemals ICMP-Fehler auf ICMP-Fehler senden!
		if (failedPacket.header.protocol === 'ICMP') {
			const icmpPayload = failedPacket.payload as ICMPPacket;
			if (icmpPayload.type === 'time-exceeded' || icmpPayload.type === 'destination-unreachable') {
				return;
			}
		}

		const icmpPacket: ICMPPacket = {
			type,
			originalPacket: failedPacket // Fehlerhaftes Paket als Kontext mitgeben
		};

		// Sendet die Fehlermeldung direkt zurück an die Quell-IP des gescheiterten Pakets
		this.send(icmpPacket, failedPacket.header.srcIp, 'ICMP');
	}
}
