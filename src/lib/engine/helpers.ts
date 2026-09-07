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

export function isValidIPv4(ip: string): boolean {
	const regex = new RegExp(IPv4Pattern);
	return regex.test(ip);
}

// Konvertiert IP-Adresse in eine 32-Bit-Zahl
export function ipToInt(ip: string): number {
	return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

// Prüft, ob zwei IPs im selben Subnetz liegen
export function isSameSubnet(ip1: string, ip2: string, mask: string): boolean {
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
