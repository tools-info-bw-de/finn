import { SvelteMap } from 'svelte/reactivity';
import { FileSystem } from '../FileSystem.svelte';
import {
	accessLogTime,
	CONTENT_TYPES,
	DEFAULT_DOCUMENT_ROOT,
	DIRECTORY_INDEX,
	errorLogTime,
	httpDate,
	MAX_HEADER_BYTES,
	normalizeHostname,
	parseRequest,
	SERVER_NAME,
	STATUS_TEXT,
	vhostDocumentRoot,
	WEB_ROOT,
	WEB_SERVER_PORT,
	type HttpRequest,
	type HttpResponse
} from '../http';
import { vhostIndexHtml } from '../defaultWebsite';
import type { VHost, WebServerState } from '../types';
import type { TCPConnection, TCPService } from './TCPService';

export { DEFAULT_DOCUMENT_ROOT, WEB_ROOT, WEB_SERVER_PORT } from '../http';

export type WebServerLogEntry = {
	level: 'access' | 'notice' | 'error';
	line: string;
};

type WebConnectionState = {
	connection: TCPConnection;
	decoder: TextDecoder;
	// Empfangene, noch nicht beantwortete Anfragen (je TCP-Segment eine Anfrage)
	queue: string[];
	detachListeners: (() => void)[];
	// true, solange eine Antwort unterwegs ist (TCP erlaubt nur ein unbestätigtes Segment)
	responding: boolean;
	// true, sobald der Server die Verbindung schließen will -> weitere Anfragen werden ignoriert
	closing: boolean;
};

export class WebServerService implements WebServerState {
	public serverRunning = $state(false);
	public readonly port = WEB_SERVER_PORT;
	public useVHosts = $state(false);
	public vhosts = $state<VHost[]>([]);
	public log = $state<WebServerLogEntry[]>([]);
	private connections = new SvelteMap<TCPConnection, WebConnectionState>();
	private releaseListener: (() => void) | undefined;

	constructor(
		private readonly tcp: TCPService,
		private readonly fileSystem: FileSystem
	) {}

	public start(): void {
		if (this.releaseListener) throw new Error('Webserver läuft bereits.');
		let active = true;
		const release = this.tcp.listen(
			WEB_SERVER_PORT,
			(connection) => {
				if (active) {
					this.acceptConnection(connection);
				} else {
					try {
						connection.close();
					} catch {
						return;
					}
				}
			},
			'HTTP'
		);
		this.releaseListener = () => {
			active = false;
			release();
		};
		this.serverRunning = true;
		this.logNotice(`Webserver gestartet, lauscht auf Port ${WEB_SERVER_PORT}`);
	}

	public stop(): void {
		if (!this.releaseListener) return;
		this.releaseListener();
		this.releaseListener = undefined;
		this.serverRunning = false;
		// Verbindungen, die gerade eine Antwort senden, werden danach geschlossen
		for (const state of [...this.connections.values()]) {
			state.closing = true;
			state.queue.length = 0;
			if (!state.responding) this.closeConnection(state);
		}
		this.logNotice('Server wird beendet');
	}

	/** Gespeicherter Zustand (wird von JSON.stringify automatisch verwendet). */
	public toJSON() {
		return {
			serverRunning: this.serverRunning,
			useVHosts: this.useVHosts,
			vhosts: this.vhosts.map((vhost) => ({ ...vhost }))
		};
	}

	public restore(data: Partial<ReturnType<WebServerService['toJSON']>>): void {
		this.useVHosts = data.useVHosts ?? false;
		this.vhosts = data.vhosts ?? [];
		if (!data.serverRunning) return;
		try {
			this.start();
		} catch (error) {
			this.logStartError(error);
		}
	}

	public dispose(): void {
		this.releaseListener?.();
		this.releaseListener = undefined;
		this.serverRunning = false;
		for (const state of [...this.connections.values()]) this.removeConnection(state);
	}

	/** Beendet den Web-Server vollständig (App wurde geschlossen): Verbindungen zu, Konfiguration verwerfen. */
	public shutdown(): void {
		for (const state of [...this.connections.values()]) {
			try {
				state.connection.close();
			} catch {
				// Verbindung war bereits geschlossen
			}
		}
		this.dispose();
		this.useVHosts = false;
		this.vhosts = [];
		this.log = [];
	}

	/**
	 * Fügt einen virtuellen Host hinzu. Existiert das Verzeichnis noch nicht,
	 * wird es samt einer einfachen index.html angelegt.
	 */
	public addVHost(hostname: string, directory: string): void {
		const name = normalizeHostname(hostname);
		if (name === '') throw new Error('Bitte einen Hostnamen angeben.');
		const documentRoot = vhostDocumentRoot(directory);
		if (!documentRoot.startsWith(WEB_ROOT + '/')) {
			throw new Error(`Bitte ein Unterverzeichnis von ${WEB_ROOT} angeben.`);
		}
		if (this.vhosts.some((vhost) => normalizeHostname(vhost.hostname) === name)) {
			throw new Error(`Für ${name} existiert bereits ein VHost.`);
		}

		this.vhosts.push({
			uuid: crypto.randomUUID(),
			hostname: name,
			directory: documentRoot.slice(WEB_ROOT.length + 1)
		});

		const indexPath = `${documentRoot}/${DIRECTORY_INDEX}`;
		if (!this.fileSystem.isDirectory(documentRoot)) {
			this.fileSystem.writeFile(indexPath, vhostIndexHtml(name, documentRoot));
		}
	}

	public removeVHost(uuid: string): void {
		this.vhosts = this.vhosts.filter((vhost) => vhost.uuid !== uuid);
	}

	// ---------------------------------------------------------------------------

	private acceptConnection(connection: TCPConnection): void {
		const state: WebConnectionState = {
			connection,
			decoder: new TextDecoder(),
			queue: [],
			detachListeners: [],
			responding: false,
			closing: false
		};
		this.connections.set(connection, state);
		state.detachListeners.push(
			connection.onData((payload) => this.receiveData(state, payload)),
			connection.onClose(() => this.removeConnection(state)),
			connection.onError((error) => {
				this.logError(`[client ${connection.remoteIp}:${connection.remotePort}] ${error.message}`);
				this.removeConnection(state);
			})
		);
	}

	private receiveData(state: WebConnectionState, payload: Uint8Array): void {
		if (state.closing) return;
		// Vereinfachung der Simulation: Jedes empfangene TCP-Segment enthält eine vollständige Anfrage.
		// Die abschließende Leerzeile ist daher optional – auch ein einzelnes "GET / HTTP/1.1"
		// (z. B. aus dem einfachen Client) wird beantwortet.
		state.queue.push(state.decoder.decode(payload, { stream: true }));
		this.processNextRequest(state);
	}

	/**
	 * Beantwortet die nächste Anfrage. Die Verbindung bleibt danach offen (persistente Verbindung,
	 * HTTP/1.1-Standard) – geschlossen wird sie vom Client. Der Server schließt nur bei
	 * "Connection: close", HTTP/1.0 oder fehlerhaften Anfragen.
	 */
	private processNextRequest(state: WebConnectionState): void {
		if (state.responding || state.closing) return;
		const text = state.queue.shift();
		if (text === undefined) return;

		if (text.length > MAX_HEADER_BYTES) {
			this.respond(state, undefined, this.errorResponse(431), true);
			return;
		}
		const request = parseRequest(text.split(/\r?\n\r?\n/)[0].trim());
		if (!request) {
			this.respond(state, undefined, this.errorResponse(400), true);
			return;
		}
		const connectionHeader = (request.headers['connection'] ?? '').toLowerCase();
		const close =
			connectionHeader === 'close' ||
			(request.version === 'HTTP/1.0' && connectionHeader !== 'keep-alive');
		this.respond(state, request, this.handleRequest(request), close);
	}

	private handleRequest(request: HttpRequest): HttpResponse {
		if (request.version !== 'HTTP/1.0' && request.version !== 'HTTP/1.1') {
			return this.errorResponse(505);
		}
		// Host-Header ist optional: ohne ihn wird das Standard-Verzeichnis verwendet
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return this.errorResponse(405, { Allow: 'GET, HEAD' });
		}

		// Absolute Form "http://host/pfad" erlauben
		let target = request.target;
		let hostFromTarget: string | undefined;
		const absolute = /^https?:\/\/([^/]*)(.*)$/i.exec(target);
		if (absolute) {
			hostFromTarget = absolute[1];
			target = absolute[2] || '/';
		}
		if (!target.startsWith('/')) return this.errorResponse(400);

		let path: string;
		try {
			path = decodeURIComponent(target.split(/[?#]/)[0]);
		} catch {
			return this.errorResponse(400);
		}

		const documentRoot = this.documentRootFor(hostFromTarget ?? request.headers['host'] ?? '');
		let filePath = FileSystem.join(documentRoot, path);
		if (filePath !== documentRoot && !filePath.startsWith(documentRoot + '/')) {
			return this.errorResponse(403);
		}
		if (this.fileSystem.isDirectory(filePath)) {
			filePath = FileSystem.join(filePath, DIRECTORY_INDEX);
		}

		const content = this.fileSystem.readFile(filePath);
		if (content === undefined) {
			this.logError(`Datei nicht gefunden: ${filePath}`);
			return this.errorResponse(404);
		}
		return { status: 200, contentType: this.contentTypeFor(filePath), body: content };
	}

	private documentRootFor(hostHeader: string): string {
		if (!this.useVHosts) return DEFAULT_DOCUMENT_ROOT;
		const host = normalizeHostname(hostHeader);
		const vhost = this.vhosts.find((entry) => normalizeHostname(entry.hostname) === host);
		return vhost ? vhostDocumentRoot(vhost.directory) : DEFAULT_DOCUMENT_ROOT;
	}

	private contentTypeFor(path: string): string {
		const name = path.slice(path.lastIndexOf('/') + 1);
		const dot = name.lastIndexOf('.');
		const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
		return CONTENT_TYPES[extension] ?? 'application/octet-stream';
	}

	private errorResponse(status: number, extraHeaders?: Record<string, string>): HttpResponse {
		const title = `${status} ${STATUS_TEXT[status] ?? ''}`.trim();
		return {
			status,
			contentType: 'text/html; charset=utf-8',
			body:
				`<!DOCTYPE html>\n<html>\n<head><title>${title}</title></head>\n` +
				`<body>\n<h1>${title}</h1>\n<hr>\n<address>${SERVER_NAME}</address>\n</body>\n</html>\n`,
			extraHeaders
		};
	}

	private respond(
		state: WebConnectionState,
		request: HttpRequest | undefined,
		response: HttpResponse,
		close: boolean
	): void {
		state.responding = true;
		if (close) state.closing = true;

		const encoder = new TextEncoder();
		const body = typeof response.body === 'string' ? encoder.encode(response.body) : response.body;
		const headers: Record<string, string> = {
			Date: httpDate(),
			Server: SERVER_NAME,
			'Content-Type': response.contentType,
			'Content-Length': String(body.length),
			...(close ? { Connection: 'close' } : {}),
			...response.extraHeaders
		};
		const head =
			`HTTP/1.1 ${response.status} ${STATUS_TEXT[response.status] ?? ''}\r\n` +
			Object.entries(headers)
				.map(([name, value]) => `${name}: ${value}\r\n`)
				.join('') +
			'\r\n';
		const headBytes = encoder.encode(head);
		const sendBody = request?.method !== 'HEAD';
		const payload = new Uint8Array(headBytes.length + (sendBody ? body.length : 0));
		payload.set(headBytes, 0);
		if (sendBody) payload.set(body, headBytes.length);

		this.logAccess(state, request, response.status, sendBody ? body.length : 0);

		try {
			state.connection.send(
				payload,
				() => {
					state.responding = false;
					if (state.closing) this.closeConnection(state);
					else this.processNextRequest(state);
				},
				() => this.removeConnection(state)
			);
		} catch {
			this.removeConnection(state);
		}
	}

	private closeConnection(state: WebConnectionState): void {
		try {
			state.connection.close(undefined, () => this.removeConnection(state));
		} catch {
			this.removeConnection(state);
		}
	}

	private removeConnection(state: WebConnectionState): void {
		if (!this.connections.delete(state.connection)) return;
		for (const detach of state.detachListeners) detach();
	}

	// --- Log --------------------------------------------------------------------

	private logAccess(
		state: WebConnectionState,
		request: HttpRequest | undefined,
		status: number,
		bytes: number
	): void {
		const quote = (value: string | undefined) =>
			value ? `"${value.replace(/"/g, '\\"')}"` : '"-"';
		const host = request?.headers['host'];
		const vhostPrefix = this.useVHosts
			? `${host ? normalizeHostname(host) : '-'}:${WEB_SERVER_PORT} `
			: '';
		const line =
			`${vhostPrefix}${state.connection.remoteIp} - - [${accessLogTime()}] ` +
			`${quote(request?.requestLine)} ${status} ${bytes || '-'} ` +
			`${quote(request?.headers['referer'])} ${quote(request?.headers['user-agent'])}`;
		this.log.push({ level: 'access', line });
	}

	private logNotice(message: string): void {
		this.log.push({ level: 'notice', line: `[${errorLogTime()}] [notice] ${message}` });
	}

	private logError(message: string): void {
		this.log.push({ level: 'error', line: `[${errorLogTime()}] [error] ${message}` });
	}

	public logStartError(error: unknown): void {
		this.logError(
			error instanceof Error ? error.message : 'Webserver konnte nicht gestartet werden.'
		);
	}
}
