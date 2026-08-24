import type { Cable } from './Cable.svelte';

export interface EthernetFrame {
	uuid: string;
	header: {
		srcMac: string;
		dstMac: string;
		type: 'IP' | 'ARP';
	};
	payload: IPPacket | ARPPacket;
}

//--------------------

export interface ARPPacket {
	type: 'request' | 'reply';
	senderIP: string;
	senderMac: string;
	targetIP: string;
	targetMac?: string; // Optional for ARP requests
}

export interface IPPacket {
	header: {
		srcIp: string;
		dstIp: string;
		protocol: 'ICMP' | 'UDP' | 'TCP';
		ttl: number;
	};
	payload: ICMPPacket | UDPDatagram | TCPSegment;
}

//------------------------

export interface ICMPPacket {
	type: 'echo-request' | 'echo-reply' | 'time-exceeded';
	seq?: number; // Only for echo-request and echo-reply
	timestamp?: number; // Only for echo-request and echo-reply
}

export interface UDPDatagram {
	header: {
		srcPort: number;
		dstPort: number;
	};
	payload: Uint8Array;
}

export interface TCPSegment {
	header: {
		srcPort: number;
		dstPort: number;
		seqNum: number;
		ackNum: number;
		flags: {
			SYN: boolean;
			ACK: boolean;
			FIN: boolean;
		};
	};
	payload: Uint8Array;
}

//------------------------

export interface LayerInterface {
	send(data: unknown, destination: string, type?: string): void;
	receive(data: unknown, type?: string): void;
	upperLayer?: LayerInterface;
	lowerLayer?: LayerInterface;
}

export interface NetworkNode {
	type: 'notebook' | 'desktop' | 'switch' | 'router';
	uuid: string;
	name: string;
	x: number;
	y: number;
}

export interface ProtocolHandler {
	receive(data: unknown, srcIp: string): void;
}

export interface CableEndpoint {
	cable?: Cable;
	receive(frame: EthernetFrame): void;
}
