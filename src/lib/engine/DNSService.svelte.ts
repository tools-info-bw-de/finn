import type { NetworkConfig } from './NetworkConfig.svelte';
import type { ARecord, NSRecord, DNSState, UDPDatagram, DNSRecord } from './types';
import { UDPService, type UDPPortBinding, type UDPPortHandler } from './UDPService';
import { SvelteMap } from 'svelte/reactivity';
import { isValidIPv4 } from './helpers';
import { SimulationEventBus } from './SimulationEventBus';
import type { ICMPService } from './ICMPService.svelte';
import type { ICMPPacket } from './types';

export type DNSQuery = {
	id: string;
	kind: 'query';
	recordType: 'A' | 'NS' | 'MX';
	name: string;
};

export type DNSResponse = {
	id: string;
	kind: 'response';
	recordType: 'A' | 'NS' | 'MX';
	name: string;
	address?: string;
	nsDomain?: string;
	glueIp?: string;
	mxDomain?: string;
	error?: string;
};

type DNSMessage = DNSQuery | DNSResponse;

type PendingLookup = {
	sourcePort: number;
	serverIp: string;
	resolve: (response: DNSResponse) => void;
	reject: (error: Error) => void;
	portBinding: UDPPortBinding;
	attempts: number;
	retryTimer?: ReturnType<typeof setTimeout>;
};

const DNS_PORT = 53;
const MAX_RECURSION_HOPS = 10;
const DNS_RETRY_DELAY_MS = 1000;
const MAX_DNS_ATTEMPTS = 3;

export class DNSLookupError extends Error {
	constructor(
		public readonly kind: 'packet-lost' | 'icmp-unreachable' | 'network-error',
		message: string
	) {
		super(message);
		this.name = 'DNSLookupError';
	}
}

function normalizeName(name: string): string {
	return name.trim().replace(/\.$/, '').toLowerCase();
}

function decodeMessage(payload: Uint8Array): DNSMessage | undefined {
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(payload));
		if (typeof value !== 'object' || value === null) return;

		const message = value as Record<string, unknown>;
		if (
			typeof message.id !== 'string' ||
			typeof message.name !== 'string' ||
			(message.recordType !== 'A' && message.recordType !== 'NS')
		) {
			return;
		}

		if (message.kind === 'query' && message.recordType === 'A') {
			return { kind: 'query', id: message.id, name: normalizeName(message.name), recordType: 'A' };
		}

		if (message.kind === 'response') {
			const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
			return {
				kind: 'response',
				id: message.id,
				name: normalizeName(message.name),
				recordType: message.recordType,
				address: str(message.address),
				nsDomain: str(message.nsDomain),
				glueIp: str(message.glueIp),
				error: str(message.error)
			};
		}
	} catch {
		return;
	}
}

function encodeMessage(message: DNSMessage): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(message));
}

export class DNSService implements UDPPortHandler {
	private pendingLookups = new SvelteMap<string, PendingLookup>();
	private releaseDnsPort: () => void;

	constructor(
		private udpService: UDPService,
		private config: NetworkConfig,
		private getServerState: () => DNSState | undefined,
		private icmpService: ICMPService
	) {
		this.releaseDnsPort = this.udpService.bindPort(DNS_PORT, this);
		this.icmpService.registerErrorHandler('UDP', (packet, srcIp) => {
			this.receiveIcmpError(packet, srcIp);
		});
	}

	public resolveAddress(nameOrIp: string): Promise<string> {
		if (isValidIPv4(nameOrIp)) return Promise.resolve(nameOrIp);
		return this.resolveA(nameOrIp);
	}

	public resolveA(domain: string): Promise<string> {
		const name = normalizeName(domain);
		if (!name) return Promise.reject(new Error('Domainname darf nicht leer sein.'));

		const dnsIp = this.config.dns;
		if (!isValidIPv4(dnsIp)) {
			return Promise.reject(new Error('Kein gültiger DNS-Server konfiguriert.'));
		}

		return this.queryServer(name, dnsIp).then((response) => {
			if (response.address && isValidIPv4(response.address)) {
				return response.address;
			}

			const message =
				response.recordType === 'NS' && response.nsDomain
					? 'Domain nicht gefunden'
					: (response.error ?? 'Ungültige DNS-Antwort.');
			throw new Error(message);
		});
	}

	private queryServer(name: string, serverIp: string, parentId?: string): Promise<DNSResponse> {
		const id = crypto.randomUUID();
		const query: DNSQuery = { id, kind: 'query', recordType: 'A', name };

		return new Promise((resolve, reject) => {
			let portBinding: UDPPortBinding;
			try {
				portBinding = this.udpService.bindEphemeralPort(this);
			} catch (error) {
				reject(
					error instanceof Error ? error : new Error('UDP-Port konnte nicht gebunden werden.')
				);
				return;
			}

			const pending: PendingLookup = {
				sourcePort: portBinding.port,
				serverIp,
				resolve,
				reject,
				portBinding,
				attempts: 1
			};
			this.pendingLookups.set(id, pending);
			SimulationEventBus.getInstance().registerOrigin(
				id,
				this.config,
				() => {
					if (this.pendingLookups.get(id) !== pending) return;
					this.finishLookup(id, pending);
					pending.reject(new Error('DNS-Anfrage wurde abgebrochen.'));
				},
				parentId
			);
			this.sendQuery(id, name, query, pending);
		});
	}

	private sendQuery(id: string, name: string, query: DNSQuery, pending: PendingLookup): void {
		SimulationEventBus.getInstance().onExtinct(id, (_timeoutUuid, message) => {
			if (this.pendingLookups.get(id) !== pending) return;
			if (message !== undefined) {
				this.finishLookup(id, pending);
				pending.reject(new DNSLookupError('network-error', message));
				return;
			}
			if (pending.attempts >= MAX_DNS_ATTEMPTS) {
				this.finishLookup(id, pending);
				pending.reject(
					new DNSLookupError(
						'packet-lost',
						`DNS-Anfrage für ${name} ist nach ${MAX_DNS_ATTEMPTS} Versuchen verloren gegangen. Ist der Hin- und Rückweg zum DNS-Server (${pending.serverIp}) fehlerfrei eingerichtet?`
					)
				);
				return;
			}

			pending.retryTimer = setTimeout(() => {
				pending.retryTimer = undefined;
				if (this.pendingLookups.get(id) !== pending) return;
				pending.attempts++;
				this.sendQuery(id, name, query, pending);
			}, DNS_RETRY_DELAY_MS);
		});

		this.udpService.send(
			{
				header: { srcPort: pending.sourcePort, dstPort: DNS_PORT, timeoutUuid: id },
				payload: encodeMessage(query)
			},
			pending.serverIp
		);
	}

	// Folgt NS-Verweisen mit Glue-IP, bis A-Antwort, Fehler oder NS ohne IP vorliegt.
	private async resolveIteratively(
		name: string,
		startIp: string,
		parentId: string
	): Promise<DNSResponse> {
		let serverIp = startIp;
		for (let hop = 0; hop < MAX_RECURSION_HOPS; hop++) {
			const response = await this.queryServer(name, serverIp, parentId);
			if (response.recordType === 'NS' && response.glueIp && isValidIPv4(response.glueIp)) {
				serverIp = response.glueIp;
				continue;
			}
			return response;
		}
		return {
			id: '',
			kind: 'response',
			recordType: 'A',
			name,
			error: 'Maximale Rekursionstiefe überschritten.'
		};
	}

	private sendAnswer(response: DNSResponse, request: UDPDatagram, srcIp: string): void {
		this.udpService.send(
			{
				header: {
					srcPort: DNS_PORT,
					dstPort: request.header.srcPort,
					timeoutUuid: request.header.timeoutUuid ?? response.id
				},
				payload: encodeMessage(response)
			},
			srcIp
		);
	}

	public receive(datagram: UDPDatagram, srcIp: string): void {
		if (!datagram.header || !(datagram.payload instanceof Uint8Array)) {
			if (datagram.header.timeoutUuid)
				SimulationEventBus.getInstance().emitExtinct(datagram.header.timeoutUuid);
			return;
		}

		const message = decodeMessage(datagram.payload);
		if (!message) {
			if (datagram.header.timeoutUuid)
				SimulationEventBus.getInstance().emitExtinct(datagram.header.timeoutUuid);
			return;
		}

		if (message.kind === 'query' && datagram.header.dstPort === DNS_PORT) {
			this.answerQuery(message, datagram, srcIp);
			return;
		}

		if (message.kind === 'response') {
			this.receiveResponse(message, datagram, srcIp);
		}
	}

	private answerQuery(query: DNSQuery, request: UDPDatagram, srcIp: string): void {
		const state = this.getServerState();
		if (!state?.serverRunning) {
			this.icmpService.sendUdpDestinationUnreachable(
				srcIp,
				request.header.timeoutUuid ?? query.id,
				request.header.srcPort,
				request.header.dstPort
			);
			return;
		}

		let record: DNSRecord | undefined;
		let nsDomain: string | undefined;
		record = state.records.find(
			(candidate): candidate is ARecord =>
				candidate.type === query.recordType && normalizeName(candidate.domain) === query.name
		);
		// Kein Ergebnis? Dann nach nem passenden NS-Record suchen
		if (!record) {
			record = state.records.find(
				(candidate): candidate is NSRecord =>
					candidate.type === 'NS' && query.name.endsWith(normalizeName(candidate.domain))
			);
			nsDomain = record?.type === 'NS' ? record.nsDomain : undefined;
		}

		let response: DNSResponse;
		// A Record gefunden? Dann direkt die Antwort zurücksenden.
		if (record && record.type === 'A' && query.recordType === 'A') {
			response = isValidIPv4(record.ip)
				? {
						kind: 'response',
						id: query.id,
						name: query.name,
						recordType: 'A',
						address: record.ip
					}
				: {
						kind: 'response',
						id: query.id,
						name: query.name,
						recordType: 'A',
						error: 'NXDOMAIN (Domain nicht gefunden oder Eintrag fehlerhaft)'
					};
		}

		// Wenn NS Record gefunden wurde, dann prüfen, ob rekursiv aufgelöst werden soll.
		// Wenn ja, dann die rekursive Auflösung starten. Wenn nein, dann eine NXDOMAIN-Antwort zurücksenden.
		else if (record && record.type === 'NS') {
			// Schauen, ob es einen passenden A-Record für den NS-Eintrag gibt.
			record = state.records.find(
				(candidate): candidate is ARecord =>
					candidate.type === 'A' && normalizeName(candidate.domain) === normalizeName(nsDomain!)
			);
			// Wenn nein, dann eine NS-Antwort zurücksenden (ohne passende IP). // Sonst...
			if (!record) {
				response = {
					kind: 'response',
					id: query.id,
					name: query.name,
					recordType: 'NS',
					nsDomain: nsDomain
				};
			} else if (state.recursiveResolution) {
				this.resolveIteratively(query.name, record.ip, request.header.timeoutUuid ?? query.id)
					.then((result) => ({ ...result, id: query.id, name: query.name }))
					.catch((error: unknown): DNSResponse => ({
						kind: 'response',
						id: query.id,
						name: query.name,
						recordType: 'A',
						error:
							error instanceof Error && !(error instanceof DNSLookupError)
								? error.message
								: 'Rekursive Auflösung fehlgeschlagen.'
					}))
					.then((result) => this.sendAnswer(result, request, srcIp));
				return;
			} else {
				// NS-Antwort zurücksenden (mit passender IP)
				response = {
					kind: 'response',
					id: query.id,
					name: query.name,
					recordType: 'NS',
					nsDomain: nsDomain,
					glueIp: record.ip
				};
			}
		}
		//DUMMY
		else {
			response = {
				kind: 'response',
				id: query.id,
				name: query.name,
				recordType: 'A',
				error: 'NXDOMAIN (Domain nicht gefunden oder Eintrag fehlerhaft)'
			};
		}

		this.udpService.send(
			{
				header: {
					srcPort: DNS_PORT,
					dstPort: request.header.srcPort,
					timeoutUuid: request.header.timeoutUuid ?? query.id
				},
				payload: encodeMessage(response)
			},
			srcIp
		);
	}

	private receiveResponse(response: DNSResponse, datagram: UDPDatagram, srcIp: string): void {
		const pending = this.pendingLookups.get(response.id);
		if (
			!pending ||
			srcIp !== pending.serverIp ||
			datagram.header.srcPort !== DNS_PORT ||
			datagram.header.dstPort !== pending.sourcePort
		) {
			return;
		}

		this.finishLookup(response.id, pending);

		pending.resolve(response);
	}

	private receiveIcmpError(packet: ICMPPacket, srcIp: string): void {
		const pending = this.pendingLookups.get(packet.timeoutUuid);
		if (
			!pending ||
			packet.original?.protocol !== 'UDP' ||
			packet.original.srcPort !== pending.sourcePort ||
			packet.original.dstPort !== DNS_PORT
		) {
			return;
		}

		this.finishLookup(packet.timeoutUuid, pending);
		pending.reject(
			new DNSLookupError('icmp-unreachable', `Ziel bzw. Dienst bei ${srcIp} nicht erreichbar.`)
		);
	}

	private finishLookup(id: string, pending: PendingLookup): void {
		if (pending.retryTimer) clearTimeout(pending.retryTimer);
		SimulationEventBus.getInstance().offExtinct(id);
		SimulationEventBus.getInstance().forgetOrigin(id);
		this.pendingLookups.delete(id);
		pending.portBinding.release();
	}
}
