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

export class NetworkLayer implements LayerInterface {
	public config: NetworkConfig;
	public arpService: ArpService;
	public upperLayer?: LayerInterface;
	public lowerLayer?: LayerInterface;

	// Register protocol handlers for ICMP, UDP, and TCP
	private protocolHandlers = new Map<string, ProtocolHandler>();

	public registerProtocolHandler(protocol: 'ICMP' | 'UDP' | 'TCP', handler: ProtocolHandler): void {
		this.protocolHandlers.set(protocol, handler);
	}

	constructor(config: NetworkConfig, arpService: ArpService) {
		this.config = config;
		this.arpService = arpService;
	}

	public send(
		payload: ICMPPacket | UDPDatagram | TCPSegment,
		destinationIp: string,
		protocol: 'ICMP' | 'UDP' | 'TCP'
	): void {
		if (!this.lowerLayer) return;

		const ipPacket: IPPacket = {
			header: {
				srcIp: this.config.ipAddress,
				dstIp: destinationIp,
				protocol,
				ttl: 64 // Default TTL value
			},
			payload
		};

		this.arpService.resolve(destinationIp, ipPacket, (macAddress) => {
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

		if (
			ipPacket.header.dstIp === this.config.ipAddress ||
			ipPacket.header.dstIp === '255.255.255.255'
		) {
			const handler = this.protocolHandlers.get(ipPacket.header.protocol);
			if (handler) {
				handler.receive(ipPacket.payload, ipPacket.header.srcIp);
			}
		} else if (ipPacket.header.ttl == 0) {
			const icmpPacket: ICMPPacket = {
				type: 'time-exceeded'
			};
			this.send(icmpPacket, ipPacket.header.srcIp, 'ICMP');
			console.warn(
				`IP packet dropped due to TTL=0. Packet from ${ipPacket.header.srcIp} to ${ipPacket.header.dstIp}`
			);
		} else {
			console.warn(
				`IP packet not for this device. Expected ${this.config.ipAddress}, got ${ipPacket.header.dstIp}`
			);
		}
	}
}
