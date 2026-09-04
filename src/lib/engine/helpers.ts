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
	'((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
