import type { NetworkConfig } from './NetworkConfig.svelte';
import type { ARecord, DNSState, UDPDatagram } from './types';
import { UDPService, type UDPPortBinding, type UDPPortHandler } from './UDPService';
import { SvelteMap } from 'svelte/reactivity';
import { isValidIPv4 } from './helpers';
import { SimulationEventBus } from './SimulationEventBus';
import type { ICMPService } from './ICMPService.svelte';
import type { ICMPPacket } from './types';

export type DNSQuery = {
	id: string;
	kind: 'query';
	recordType: 'A';
	name: string;
};

export type DNSResponse = {
	id: string;
	kind: 'response';
	recordType: 'A';
	name: string;
	address?: string;
	error?: string;
};

type DNSMessage = DNSQuery | DNSResponse;

type PendingLookup = {
	sourcePort: number;
	resolve: (address: string) => void;
	reject: (error: Error) => void;
	portBinding: UDPPortBinding;
};

const DNS_PORT = 53;

export class DNSLookupError extends Error {
	constructor(
		public readonly kind: 'packet-lost' | 'icmp-unreachable',
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
			message.recordType !== 'A'
		) {
			return;
		}

		if (message.kind === 'query') {
			return { kind: 'query', id: message.id, name: normalizeName(message.name), recordType: 'A' };
		}

		if (message.kind === 'response') {
			if (typeof message.address === 'string') {
				return {
					kind: 'response',
					id: message.id,
					name: normalizeName(message.name),
					recordType: 'A',
					address: message.address
				};
			}
			if (typeof message.error === 'string') {
				return {
					kind: 'response',
					id: message.id,
					name: normalizeName(message.name),
					recordType: 'A',
					error: message.error
				};
			}
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

			this.pendingLookups.set(id, {
				sourcePort: portBinding.port,
				resolve,
				reject,
				portBinding
			});
			SimulationEventBus.getInstance().onExtinct(id, () => {
				const pending = this.pendingLookups.get(id);
				if (!pending) return;
				this.finishLookup(id, pending);
				pending.reject(
					new DNSLookupError(
						'packet-lost',
						`DNS-Anfrage für ${name} ist im Netzwerk verloren gegangen.`
					)
				);
			});
			this.udpService.send(
				{
					header: { srcPort: portBinding.port, dstPort: DNS_PORT, timeoutUuid: id },
					payload: encodeMessage(query)
				},
				dnsIp
			);
		});
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

		const record = state.records.find(
			(candidate): candidate is ARecord =>
				candidate.type === 'A' && normalizeName(candidate.domain) === query.name
		);
		const response: DNSResponse =
			record && isValidIPv4(record.ip)
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
						error: 'NXDOMAIN'
					};

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
			srcIp !== this.config.dns ||
			datagram.header.srcPort !== DNS_PORT ||
			datagram.header.dstPort !== pending.sourcePort
		) {
			return;
		}

		this.finishLookup(response.id, pending);

		if (response.address && isValidIPv4(response.address)) {
			pending.resolve(response.address);
		} else {
			pending.reject(new Error(response.error ?? 'Ungültige DNS-Antwort.'));
		}
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
		SimulationEventBus.getInstance().offExtinct(id);
		this.pendingLookups.delete(id);
		pending.portBinding.release();
	}
}
