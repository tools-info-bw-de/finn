import { cables } from '$lib/states/cables.svelte';
import { nodes } from '$lib/states/nodes.svelte';
import type { ICMPPacket, IPPacket, NetworkNode, TCPSegment, UDPDatagram } from './types';

export function generateRandomMac(): string {
	const bytes = new Uint8Array(6);

	// Zufällige Bytes generieren
	crypto.getRandomValues(bytes);

	// Bytes in HEX-Strings umwandeln und mit Doppelpunkten verbinden
	const macString = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0').toUpperCase())
		.join(':');

	return macString;
}

export const IPv4Pattern: string =
	'^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$';

export const NetmaskPattern: string =
	'^((255|254|252|248|240|224|192|128|0)\\.){3}(255|254|252|248|240|224|192|128|0)$';

export function isValidNetmask(mask: string): boolean {
	const regex = new RegExp(NetmaskPattern);
	if (!regex.test(mask)) {
		return false;
	}

	const maskInt = ipToInt(mask);
	// Prüfen, ob die Maske eine gültige Subnetzmaske ist (nur zusammenhängende 1er-Bits)
	const inverseMask = ~maskInt >>> 0;
	return (inverseMask & (inverseMask + 1)) === 0;
}

export function isValidIPv4(ip: string): boolean {
	const regex = new RegExp(IPv4Pattern);
	return regex.test(ip);
}

export function getPacketTrackingId(packet: IPPacket): string | undefined {
	if (packet.header.protocol === 'UDP') {
		return (packet.payload as UDPDatagram).header.timeoutUuid;
	}
	if (packet.header.protocol === 'TCP') {
		return (packet.payload as TCPSegment).header.timeoutUuid;
	}
	return (packet.payload as ICMPPacket).timeoutUuid;
}

// Konvertiert IP-Adresse in eine 32-Bit-Zahl
export function ipToInt(ip: string): number {
	return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

// Prüft, ob zwei IPs im selben Subnetz liegen
export function isSameSubnet(ip1: string, ip2: string, mask: string): boolean {
	if (ip1 === '127.0.0.1' || ip2 === '127.0.0.1') {
		return true;
	}
	const maskInt = ipToInt(mask);
	return (ipToInt(ip1) & maskInt) === (ipToInt(ip2) & maskInt);
}

// Berechnet die Subnetzadresse aus IP und Maske
export function getSubnetAddress(ip: string, mask: string): string {
	const ipInt = ipToInt(ip);
	const maskInt = ipToInt(mask);
	const netInt = (ipInt & maskInt) >>> 0;
	return [(netInt >>> 24) & 255, (netInt >>> 16) & 255, (netInt >>> 8) & 255, netInt & 255].join(
		'.'
	);
}

export function getColorForProtocol(protocol: string | undefined): string {
	switch (protocol) {
		case 'ARP':
			return '#523e3a';
		case 'ICMP':
			return '#3ca500';
		case 'ERROR':
			return '#bb0000';
		case 'UDP':
			return '#ffa600';
		case 'TCP':
			return '#0000ff';
		default:
			return '#89b4fa'; // Default color for unknown protocols
	}
}

/**
 * BFS im Netzwerkgraphen, um Loops zu erkennen.
 * Es werden nacheinander alle LANs per BFS durchlaufen.
 * @returns
 */
export function checkNetForLoops(): 'loop' | 'sameRouterTwice' | 'ok' {
	// übertrage knoten und kanten in geeignete datenstrukturen:
	const knoten: Map<string, { type: NetworkNode['type']; visited: boolean }> = new Map();
	const kanten: string[][] = [];

	for (const n of nodes) {
		knoten.set(n.uuid, { type: n.type, visited: false });
	}
	for (const c of cables) {
		kanten.push([c.from, c.to]);
	}

	const queue: string[] = [];

	// solange es noch weitere nicht-besuchte knoten gibt:
	while (knoten.values().some((k) => k.type !== 'router' && !k.visited)) {
		// wähle einen nicht-besuchten knoten aus
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const current = [...knoten.entries()].find(([_, k]) => k.type !== 'router' && !k.visited);
		if (!current) break;
		queue.push(current[0]);

		// führe BFS von diesem Knoten aus durch
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) break;

			const currentNode = knoten.get(current);
			if (!currentNode) continue;

			if (currentNode.visited) {
				if (currentNode.type === 'router') {
					// Router wurde zweimal im selben LAN gefunden
					return 'sameRouterTwice'; // "sameRouterTwice"-Fehler
				}
				return 'loop'; // Loop gefunden
			}

			knoten.set(current, { ...currentNode, visited: true });

			if (currentNode.type !== 'router') {
				// füge benachbarte knoten zur queue hinzu
				let i = 0;
				while (i < kanten.length) {
					const [from, to] = kanten[i];
					if (from === current || to === current) {
						queue.push(from === current ? to : from);
						kanten.splice(i, 1); // Entferne die Kante, um ein zurücklaufen zu vermeiden
					} else {
						i++;
					}
				}
			}
		}
		// Setze alle router zurück, damit ein weiteres LAN wieder separat überprüft werden kann.
		for (const [uuid, node] of knoten.entries()) {
			if (node.type === 'router') {
				knoten.set(uuid, { ...node, visited: false });
			}
		}
	}

	return 'ok';
}
