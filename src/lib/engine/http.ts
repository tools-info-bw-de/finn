import { bytesToBase64, FileSystem, type FileContent } from './FileSystem.svelte';

// Reine HTTP-Hilfsfunktionen (ohne Svelte-Reaktivität) für den simulierten Web-Server

export const WEB_SERVER_PORT = 80;
export const WEB_ROOT = '/var/www';
export const DEFAULT_DOCUMENT_ROOT = `${WEB_ROOT}/html`;
export const DIRECTORY_INDEX = 'index.html';

export const SERVER_NAME = 'FinnHTTPd/1.0';
export const MAX_HEADER_BYTES = 8192;

export type HttpRequest = {
	method: string;
	target: string;
	version: string;
	headers: Record<string, string>;
	requestLine: string;
};

export type HttpResponse = {
	status: number;
	contentType: string;
	body: FileContent;
	extraHeaders?: Record<string, string>;
};

export const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	400: 'Bad Request',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	431: 'Request Header Fields Too Large',
	505: 'HTTP Version Not Supported'
};

export const CONTENT_TYPES: Record<string, string> = {
	html: 'text/html; charset=utf-8',
	htm: 'text/html; charset=utf-8',
	css: 'text/css; charset=utf-8',
	js: 'text/javascript; charset=utf-8',
	json: 'application/json; charset=utf-8',
	txt: 'text/plain; charset=utf-8',
	svg: 'image/svg+xml',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	ico: 'image/x-icon',
	xml: 'application/xml; charset=utf-8'
};

export const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

export function timezoneOffset(date: Date): string {
	const offset = -date.getTimezoneOffset();
	const sign = offset >= 0 ? '+' : '-';
	const abs = Math.abs(offset);
	return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

// Format des Access-Logs (Common Log Format): 22/Nov/2026:14:03:11 +0100
export function accessLogTime(date = new Date()): string {
	return (
		`${pad(date.getDate())}/${MONTHS[date.getMonth()]}/${date.getFullYear()}:` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${timezoneOffset(date)}`
	);
}

// Format des Error-Logs: Sun Nov 22 14:03:11 2026
export function errorLogTime(date = new Date()): string {
	return (
		`${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${date.getFullYear()}`
	);
}

export function httpDate(date = new Date()): string {
	return date.toUTCString();
}

/** Bereinigt einen Hostnamen aus dem Host-Header bzw. der VHost-Konfiguration. */
export function normalizeHostname(value: string): string {
	let host = value.trim().toLowerCase();
	// Port abschneiden (IPv6-Literale werden nicht unterstützt)
	const colon = host.indexOf(':');
	if (colon !== -1) host = host.slice(0, colon);
	if (host.endsWith('.')) host = host.slice(0, -1);
	return host;
}

/** Liefert das absolute Document-Root für ein Unterverzeichnis unterhalb von /var/www. */
export function vhostDocumentRoot(directory: string): string {
	return FileSystem.join(WEB_ROOT, directory);
}

export function parseRequest(head: string): HttpRequest | undefined {
	const lines = head.split(/\r?\n/);
	const requestLine = lines.shift() ?? '';
	const parts = requestLine.split(' ');
	if (parts.length !== 3) return undefined;
	const [method, target, version] = parts;
	if (!/^[A-Z]+$/.test(method) || !/^HTTP\/\d\.\d$/.test(version) || target === '') {
		return undefined;
	}

	const headers: Record<string, string> = Object.create(null);
	for (const line of lines) {
		const colon = line.indexOf(':');
		if (colon <= 0) return undefined;
		headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}
	return { method, target, version, headers, requestLine };
}

// --- Client-Seite (Web-Browser) ---------------------------------------------

export class BrowserError extends Error {
	constructor(
		public readonly title: string,
		detail: string
	) {
		super(detail);
	}
}

export type HttpClientResponse = {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: Uint8Array;
};

/**
 * Wandelt die Eingabe im URL-Feld in eine URL um. Ohne Schema wird "http://" ergänzt.
 * Unterstützt wird nur HTTP auf Port 80.
 */
export function parseBrowserUrl(input: string, base?: string): URL {
	const value = input.trim();
	if (value === '') throw new BrowserError('Ungültige URL', 'Bitte eine Adresse eingeben.');
	const withScheme = base || /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;

	let url: URL;
	try {
		url = new URL(withScheme, base);
	} catch {
		throw new BrowserError('Ungültige URL', value);
	}
	if (url.protocol !== 'http:') {
		throw new BrowserError(
			`Protokoll "${url.protocol}" nicht unterstützt`,
			'Nur http:// wird unterstützt.'
		);
	}
	if (url.port !== '' && url.port !== String(WEB_SERVER_PORT)) {
		throw new BrowserError('Nicht unterstützt', `Nur Port ${WEB_SERVER_PORT} wird unterstützt.`);
	}
	if (url.hostname === '') throw new BrowserError('Ungültige URL', value);
	url.hash = '';
	return url;
}

export function buildGetRequest(url: URL): Uint8Array {
	// Bewusst minimal; der Host-Header wird nur für VHosts benötigt
	return new TextEncoder().encode(
		`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\n\r\n`
	);
}

function findHeaderEnd(bytes: Uint8Array): number {
	for (let i = 0; i + 3 < bytes.length; i++) {
		if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
			return i;
		}
	}
	return -1;
}

/**
 * Prüft, ob eine Antwort vollständig empfangen wurde (Header + so viele Bytes wie im Content-Length).
 * Ohne Content-Length endet die Antwort erst mit dem Schließen der Verbindung durch den Server.
 */
export function isResponseComplete(bytes: Uint8Array): boolean {
	const headerEnd = findHeaderEnd(bytes);
	if (headerEnd === -1) return false;
	const head = new TextDecoder().decode(bytes.subarray(0, headerEnd));
	const match = /\r\ncontent-length:\s*(\d+)/i.exec(head);
	return match !== null && bytes.length - (headerEnd + 4) >= Number(match[1]);
}

export function parseHttpResponse(bytes: Uint8Array): HttpClientResponse {
	const headerEnd = findHeaderEnd(bytes);
	if (headerEnd === -1) {
		throw new BrowserError(
			'Ungültige Antwort',
			'Der Server hat keine gültige HTTP-Antwort gesendet.'
		);
	}
	const head = new TextDecoder().decode(bytes.subarray(0, headerEnd));
	const [statusLine, ...lines] = head.split('\r\n');
	const match = /^HTTP\/\d\.\d (\d{3})(?: (.*))?$/.exec(statusLine);
	if (!match) {
		throw new BrowserError(
			'Ungültige Antwort',
			'Der Server hat keine gültige HTTP-Antwort gesendet.'
		);
	}

	const headers: Record<string, string> = Object.create(null);
	for (const line of lines) {
		const colon = line.indexOf(':');
		if (colon <= 0) continue;
		headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}

	let body = bytes.subarray(headerEnd + 4);
	const length = Number(headers['content-length']);
	if (Number.isInteger(length) && length >= 0 && length < body.length) {
		body = body.subarray(0, length);
	}
	return { status: Number(match[1]), statusText: match[2] ?? '', headers, body };
}

export function mimeType(response: HttpClientResponse): string {
	return (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
}

export function toDataUri(response: HttpClientResponse): string {
	return `data:${mimeType(response) || 'application/octet-stream'};base64,${bytesToBase64(response.body)}`;
}
