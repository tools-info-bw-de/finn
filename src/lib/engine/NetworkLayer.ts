import type {
	LayerInterface,
	IPPacket,
	ARPPacket,
	ICMPPacket,
	UDPDatagram,
	TCPSegment
} from './types';
import type { ArpService } from './ArpService.svelte';

export class NetworkLayer implements LayerInterface {
	public ipAdress: string;
	public arpService: ArpService;
	public upperLayer?: LayerInterface;
	public lowerLayer?: LayerInterface;

	constructor(ipAdress: string, arpService: ArpService) {
		this.ipAdress = ipAdress;
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
				srcIp: this.ipAdress,
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
		if (ipPacket.header.dstIp === this.ipAdress || ipPacket.header.dstIp === '255.255.255.255') {
			this.upperLayer?.receive(ipPacket.payload, ipPacket.header.protocol);
		} else {
			console.warn(
				`IP packet not for this device. Expected ${this.ipAdress}, got ${ipPacket.header.dstIp}`
			);
		}
	}
}
