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
	uuid?: string; // Nur bei 'request' gesetzt: Kennung zur Verfolgung aller Broadcast-Kopien
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
	type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'destination-unreachable';
	seq?: number; // Only for echo-request and echo-reply
	timestamp?: number; // Only for echo-request and echo-reply
	timeoutUuid: string; // Only for time-exceeded and destination-unreachable
	// Only for errors: Kontext des Pakets, das den Fehler ausgelöst hat (Demux wie bei echtem ICMP)
	original?: {
		protocol: 'ICMP' | 'UDP' | 'TCP';
		seq?: number;
		srcPort?: number;
		dstPort?: number;
	};
}

export interface UDPDatagram {
	header: {
		srcPort: number;
		dstPort: number;
		timeoutUuid?: string;
	};
	payload: Uint8Array;
}

export interface TCPSegment {
	header: {
		srcPort: number;
		dstPort: number;
		seqNum: number;
		ackNum: number;
		timeoutUuid: string;
		flags: {
			SYN: boolean;
			ACK: boolean;
			FIN: boolean;
			RST: boolean;
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

//------------------------

export interface WindowData {
	nodeUuid: string;
	isSniffer: boolean;
	sniffedNode?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	open: boolean;
}

export interface TerminalState {
	history: string[];
	historyIndex: number; // -1 = aktueller Entwurf, >= 0 = Index in history (rückwärts)
	draftInput: string;
	inputBuffer: string;
	cursorPos: number;
	screen: string | null; // null = noch nie geöffnet
	running: boolean; // Befehl lief beim letzten Speichern
}

export interface DNSState {
	serverRunning: boolean;
	recursiveResolution: boolean;
	records: DNSRecord[]; // value = IP für A, NS-Domain für NS, MX-Domain für MX
}

export type AppType =
	'terminal' | 'dns' | 'echo-server' | 'simple-client' | 'web-server' | 'web-browser' | 'editor';
export type AppName = AppType | '';

export type App =
	| { type: 'terminal'; content: TerminalState }
	| { type: 'dns'; content: DNSState }
	| { type: Exclude<AppType, 'terminal' | 'dns'>; content: null };

//------------------------

export type DNSRecord = ARecord | NSRecord | MXRecord;

export interface ARecord {
	uuid: string;
	type: 'A';
	domain: string;
	ip: string;
}

export interface NSRecord {
	uuid: string;
	type: 'NS';
	domain: string;
	nsDomain: string;
}

export interface MXRecord {
	uuid: string;
	type: 'MX';
	domain: string;
	mxDomain: string;
}
