import {
	BrowserError,
	errorTypeForStatus,
	buildGetRequest,
	isResponseComplete,
	mimeType,
	parseBrowserUrl,
	parseHttpResponse,
	toDataUri,
	WEB_SERVER_PORT,
	type HttpClientResponse
} from '../http';
import { isValidIPv4 } from '../helpers';
import type { WebBrowserState } from '../types';
import type { DNSService } from './DNSService.svelte';
import type { TCPConnection, TCPService } from './TCPService';

const MAX_REDIRECTS = 5;

export type BrowserResourceKind = 'stylesheet' | 'script' | 'image';

export type BrowserResource = {
	id: string;
	url: string;
	kind: BrowserResourceKind;
	status: 'pending' | 'loading' | 'done' | 'error';
	// CSS-/JS-Quelltext bzw. Data-URI bei Bildern
	content?: string;
};

export type BrowserErrorType = 'connection' | 'dns' | '404' | '403' | '405' | '400';

type PooledConnection = {
	connection: TCPConnection;
	established: Promise<void>;
	// Bisher empfangene Bytes der aktuellen Antwort
	received: Uint8Array<ArrayBuffer>;
	// Wartende Anfrage (es läuft immer höchstens eine Anfrage pro Verbindung)
	pending?: { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void };
	closed: boolean;
};

export type BrowserPageError = { type: BrowserErrorType; title: string; detail: string };

// Wird in jede Seite eingefügt: setzt nachgeladene Dateien ein und leitet Link-Klicks an den Browser weiter
const PAGE_RUNTIME = `(function () {
	window.addEventListener('message', function (event) {
		var data = event.data;
		if (event.source !== window.parent || !data || data.type !== 'finn-resource') return;
		var el = document.querySelector('[data-finn-res="' + data.id + '"]');
		if (!el) return;
		if (data.kind === 'image') {
			el.setAttribute('src', data.content);
			return;
		}
		var replacement = document.createElement(data.kind === 'stylesheet' ? 'style' : 'script');
		replacement.textContent = data.content;
		el.replaceWith(replacement);
	});
	document.addEventListener('click', function (event) {
		var link = event.target && event.target.closest && event.target.closest('a[href]');
		if (!link) return;
		var href = link.getAttribute('href');
		if (!href || href.charAt(0) === '#') return;
		event.preventDefault();
		window.parent.postMessage({ type: 'finn-navigate', href: href }, '*');
	});
})();`;

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class WebBrowserService implements WebBrowserState {
	public url = $state('');
	public loading = $state(false);
	// Adresse der aktuell angezeigten Seite (Basis für relative Links)
	public pageUrl = $state<string | null>(null);
	// HTML für das iframe (ohne die nachzuladenden Dateien)
	public document = $state<string | null>(null);
	public resources = $state<BrowserResource[]>([]);
	public error = $state<BrowserPageError | null>(null);
	// Datei, die gerade angefragt wird (für die Statusleiste)
	public currentRequest = $state<string | null>(null);

	private navigation = 0;
	// DNS-Cache für den aktuellen Ladevorgang: jeder Hostname wird nur einmal aufgelöst
	private dnsCache: Record<string, Promise<string>> = {};
	// Offene, persistente Verbindungen des aktuellen Ladevorgangs (Hostname -> Verbindung)
	private pool: Record<string, PooledConnection> = {};

	constructor(
		private readonly tcp: TCPService,
		private readonly dns: DNSService
	) {}

	/** Lädt die Seite im URL-Feld (oder eine übergebene Adresse, z. B. von einem Link). */
	public async navigate(input: string = this.url, base?: string): Promise<void> {
		const navigation = ++this.navigation;
		this.closeConnections();
		this.dnsCache = {};
		this.loading = true;
		this.error = null;
		this.document = null;
		this.resources = [];
		this.pageUrl = null;

		try {
			const url = parseBrowserUrl(input, base);
			this.url = url.href;
			const { response, finalUrl } = await this.fetchDocument(url, navigation);
			if (navigation !== this.navigation) return;

			this.url = finalUrl.href;
			if (response.status >= 400) {
				throw new BrowserError(
					errorTypeForStatus(response.status),
					`${response.status} ${response.statusText}`.trim(),
					finalUrl.href
				);
			}
			this.pageUrl = finalUrl.href;
			this.showDocument(response, finalUrl);
			await this.loadResources(navigation);
		} catch (error) {
			if (navigation !== this.navigation) return;
			this.error =
				error instanceof BrowserError
					? { type: error.type, title: error.title, detail: error.message }
					: {
							type: 'connection',
							title: 'Fehler',
							detail: error instanceof Error ? error.message : String(error)
						};
		} finally {
			if (navigation === this.navigation) {
				this.loading = false;
				this.currentRequest = null;
				this.closeConnections();
			}
		}
	}

	/** Bricht das Laden ab und leert die Anzeige. */
	public reset(): void {
		this.navigation++;
		this.dnsCache = {};
		this.loading = false;
		this.currentRequest = null;
		this.document = null;
		this.resources = [];
		this.pageUrl = null;
		this.error = null;
		this.closeConnections();
	}

	/** Gespeicherter Zustand (wird von JSON.stringify automatisch verwendet). */
	public toJSON() {
		return { url: this.url };
	}

	public restore(data: Partial<ReturnType<WebBrowserService['toJSON']>>): void {
		this.url = data.url ?? '';
	}

	public dispose(): void {
		this.reset();
	}

	// ---------------------------------------------------------------------------

	private async fetchDocument(
		url: URL,
		navigation: number
	): Promise<{ response: HttpClientResponse; finalUrl: URL }> {
		let current = url;
		for (let redirects = 0; ; redirects++) {
			const response = await this.get(current, navigation);
			const location = response.headers['location'];
			if (response.status < 300 || response.status >= 400 || !location) {
				return { response, finalUrl: current };
			}
			if (redirects >= MAX_REDIRECTS) {
				throw new BrowserError('connection', 'Zu viele Weiterleitungen', current.href);
			}
			current = parseBrowserUrl(location, current.href);
		}
	}

	/** Eine einzelne GET-Anfrage: DNS-Auflösung, TCP-Verbindung auf Port 80, Antwort bis zum Verbindungsende. */
	private async get(url: URL, navigation: number): Promise<HttpClientResponse> {
		this.currentRequest = url.href;

		let ip: string;
		try {
			ip = await (this.dnsCache[url.hostname] ??= this.dns.resolveAddress(url.hostname));
		} catch (error) {
			throw new BrowserError(
				'dns',
				'Server nicht gefunden',
				error instanceof Error ? error.message : url.hostname
			);
		}
		if (!isValidIPv4(ip)) throw new BrowserError('dns', 'Server nicht gefunden', url.hostname);
		if (navigation !== this.navigation)
			throw new BrowserError('connection', 'Abgebrochen', url.href);

		const pooled = await this.connectionFor(url.hostname, ip);
		const bytes = await new Promise<Uint8Array>((resolve, reject) => {
			pooled.pending = { resolve, reject };
			try {
				pooled.connection.send(buildGetRequest(url), undefined, reject);
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		}).catch((error: Error) => {
			throw new BrowserError('connection', 'Verbindung fehlgeschlagen', error.message);
		});
		pooled.pending = undefined;

		if (bytes.length === 0) {
			throw new BrowserError(
				'connection',
				'Leere Antwort',
				`${url.host} hat keine Daten gesendet.`
			);
		}
		return parseHttpResponse(bytes);
	}

	/** Bereitet die Antwort für die Anzeige vor und sammelt die nachzuladenden Dateien. */
	private showDocument(response: HttpClientResponse, url: URL): void {
		const type = mimeType(response);
		const text = new TextDecoder().decode(response.body);

		if (type === 'text/html' || type === '') {
			this.prepareHtml(text, url);
		} else if (type.startsWith('image/')) {
			this.document = `<!DOCTYPE html><html><body style="margin:0"><img src="${toDataUri(response)}" alt=""></body></html>`;
		} else if (type.startsWith('text/') || type.endsWith('json') || type.endsWith('xml')) {
			this.document = `<!DOCTYPE html><html><body><pre style="white-space:pre-wrap">${escapeHtml(text)}</pre></body></html>`;
		} else {
			throw new BrowserError(
				'400',
				'Nicht darstellbar',
				`Inhaltstyp ${type} wird nicht unterstützt.`
			);
		}
	}

	private prepareHtml(html: string, url: URL): void {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const resources: BrowserResource[] = [];

		const elements = doc.querySelectorAll<HTMLElement>('link[href], script[src], img[src]');
		for (const element of elements) {
			let kind: BrowserResourceKind;
			let attribute: 'href' | 'src';
			if (element.tagName === 'LINK') {
				const rel = (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
				if (!rel.includes('stylesheet')) continue;
				kind = 'stylesheet';
				attribute = 'href';
			} else if (element.tagName === 'SCRIPT') {
				kind = 'script';
				attribute = 'src';
				// Nicht ausführen, bis der Inhalt geladen und eingesetzt wurde
				element.setAttribute('type', 'text/x-finn-pending');
			} else {
				kind = 'image';
				attribute = 'src';
			}

			const reference = element.getAttribute(attribute) ?? '';
			element.removeAttribute(attribute);
			let resourceUrl: string;
			try {
				resourceUrl = parseBrowserUrl(reference, url.href).href;
			} catch {
				continue;
			}
			const id = `r${resources.length}`;
			element.setAttribute('data-finn-res', id);
			resources.push({ id, url: resourceUrl, kind, status: 'pending' });
		}

		const runtime = doc.createElement('script');
		runtime.textContent = PAGE_RUNTIME;
		doc.head.prepend(runtime);

		this.resources = resources;
		this.document = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
	}

	/** Lädt die eingebundenen Dateien nacheinander, jeweils mit einer eigenen Anfrage. */
	private async loadResources(navigation: number): Promise<void> {
		for (const resource of this.resources) {
			if (navigation !== this.navigation) return;
			resource.status = 'loading';
			try {
				const response = await this.get(parseBrowserUrl(resource.url), navigation);
				if (navigation !== this.navigation) return;
				if (response.status !== 200) {
					resource.status = 'error';
					continue;
				}
				resource.content =
					resource.kind === 'image' ? toDataUri(response) : new TextDecoder().decode(response.body);
				resource.status = 'done';
			} catch {
				if (navigation !== this.navigation) return;
				resource.status = 'error';
			}
		}
	}

	/**
	 * Liefert die offene Verbindung zu einem Host oder baut eine neue auf. Alle Anfragen eines
	 * Seitenaufrufs an denselben Host laufen nacheinander über diese eine (persistente) Verbindung.
	 */
	private async connectionFor(hostname: string, ip: string): Promise<PooledConnection> {
		let pooled = this.pool[hostname];
		if (!pooled || pooled.closed) {
			pooled = this.openConnection(hostname, ip);
			this.pool[hostname] = pooled;
		}
		try {
			await pooled.established;
		} catch (error) {
			throw new BrowserError(
				'connection',
				'Verbindung fehlgeschlagen',
				error instanceof Error ? error.message : String(error)
			);
		}
		return pooled;
	}

	private openConnection(hostname: string, ip: string): PooledConnection {
		let markEstablished!: () => void;
		let failEstablishing!: (error: Error) => void;
		const established = new Promise<void>((resolve, reject) => {
			markEstablished = resolve;
			failEstablishing = reject;
		});
		// Wird ggf. nie abgewartet (z. B. Abbruch) -> keine "unhandled rejection"
		established.catch(() => {});

		const pooled: PooledConnection = {
			connection: undefined as unknown as TCPConnection,
			established,
			received: new Uint8Array(0),
			closed: false
		};
		const drop = (error?: Error) => {
			if (pooled.closed) return;
			pooled.closed = true;
			if (this.pool[hostname] === pooled) delete this.pool[hostname];
			failEstablishing(error ?? new Error('Verbindung wurde geschlossen.'));
			const pending = pooled.pending;
			pooled.pending = undefined;
			// Server hat nach der Antwort geschlossen (Connection: close) -> Antwort ist vollständig
			if (pending && !error && pooled.received.length > 0) pending.resolve(pooled.received);
			else pending?.reject(error ?? new Error('Verbindung wurde vom Server geschlossen.'));
		};

		try {
			pooled.connection = this.tcp.connect(ip, WEB_SERVER_PORT, markEstablished, drop, 'HTTP');
		} catch (error) {
			drop(error instanceof Error ? error : new Error(String(error)));
			return pooled;
		}
		pooled.connection.onData((payload) => {
			const combined = new Uint8Array(pooled.received.length + payload.length);
			combined.set(pooled.received, 0);
			combined.set(payload, pooled.received.length);
			pooled.received = combined;
			if (!pooled.pending || !isResponseComplete(pooled.received)) return;
			const pending = pooled.pending;
			const response = pooled.received;
			pooled.pending = undefined;
			pooled.received = new Uint8Array(0);
			pending.resolve(response);
		});
		pooled.connection.onClose(() => drop());
		pooled.connection.onError(drop);
		return pooled;
	}

	/** Seite fertig geladen (oder abgebrochen): Der Browser beendet alle Verbindungen (FIN). */
	private closeConnections(): void {
		for (const pooled of Object.values(this.pool)) {
			pooled.closed = true;
			try {
				pooled.connection.close();
			} catch {
				// Verbindung war bereits geschlossen oder wartet noch auf ein ACK
			}
		}
		this.pool = {};
	}
}
