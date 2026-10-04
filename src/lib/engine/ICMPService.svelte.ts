import type { NetworkLayer } from './NetworkLayer';
import type { ICMPPacket, IPPacket } from './types';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { SimulationEventBus } from './SimulationEventBus';

export interface PingResult {
	seq: number;
	ttl: number;
	targetIp: string;
	timeMs: number;
	success: boolean;
}

type PingReplyEvent = {
	srcIp: string;
	seq: number;
	timeMs: number;
	ttl: number;
};

type PingTimeoutEvent = {
	seq: number;
	targetIp: string;
};

type PingErrorEvent = {
	srcIp: string;
	seq: number;
	type: 'time-exceeded' | 'destination-unreachable';
};

type IcmpEventPayloads = {
	reply: PingReplyEvent;
	timeout: PingTimeoutEvent;
	error: PingErrorEvent;
	message: string;
};

// Andere Protokolle (TCP/UDP) registrieren sich hier für Fehler ihrer eigenen Pakete
export type IcmpErrorHandler = (packet: ICMPPacket, srcIp: string) => void;

type IcmpEventName = keyof IcmpEventPayloads;
type EventCallback<EventName extends IcmpEventName> = (data: IcmpEventPayloads[EventName]) => void;
type StoredEventCallback = (data: unknown) => void;

export class ICMPService {
	private networkLayer: NetworkLayer;

	public results = $state<PingResult[]>([]);

	private errorHandlers = new SvelteMap<string, IcmpErrorHandler>();

	// Speichert Listener (z.B. vom Terminal) und offene Timeouts
	private listeners = new SvelteMap<IcmpEventName, Set<StoredEventCallback>>();

	constructor(networkLayer: NetworkLayer) {
		this.networkLayer = networkLayer;
	}

	// --- EVENT SYSTEM (für Terminal & andere Abonnenten) ---
	public on<EventName extends IcmpEventName>(event: EventName, cb: EventCallback<EventName>): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new SvelteSet());
		}
		this.listeners.get(event)!.add(cb as unknown as StoredEventCallback);
	}

	public off<EventName extends IcmpEventName>(
		event: EventName,
		cb: EventCallback<EventName>
	): void {
		this.listeners.get(event)?.delete(cb as unknown as StoredEventCallback);
	}

	private emit<EventName extends IcmpEventName>(
		event: EventName,
		data: IcmpEventPayloads[EventName]
	): void {
		this.listeners.get(event)?.forEach((cb) => cb(data));
	}

	// --- METHODEN ---
	public registerErrorHandler(protocol: 'UDP' | 'TCP', handler: IcmpErrorHandler): void {
		this.errorHandlers.set(protocol, handler);
	}

	public sendPing(targetIp: string, seq: number): void {
		const startTime = performance.now();

		const payload: ICMPPacket = {
			type: 'echo-request',
			seq: seq,
			timestamp: startTime,
			timeoutUuid: crypto.randomUUID() // Generiere eine eindeutige UUID für diesen Ping
		};

		SimulationEventBus.getInstance().onExtinct(payload.timeoutUuid, () => {
			this.emit('timeout', { seq, targetIp });
		});

		this.networkLayer.send(payload, targetIp, 'ICMP');
	}

	public receive(ippacket: IPPacket, srcIp: string): void {
		const packet: ICMPPacket = ippacket.payload as ICMPPacket;

		if (packet.type === 'time-exceeded' || packet.type === 'destination-unreachable') {
			const protocol = packet.original?.protocol;
			if (protocol === 'ICMP') {
				SimulationEventBus.getInstance().offExtinct(packet.timeoutUuid);
				this.emit('error', { srcIp, seq: packet.original?.seq ?? 0, type: packet.type });
			} else if (protocol) {
				this.errorHandlers.get(protocol)?.(packet, srcIp);
			}
			return;
		}

		if (packet.type === 'echo-request') {
			const reply: ICMPPacket = {
				type: 'echo-reply',
				seq: packet.seq,
				timeoutUuid: packet.timeoutUuid,
				timestamp: packet.timestamp
			};
			this.networkLayer.send(reply, srcIp, 'ICMP');
			return;
		}

		if (packet.type === 'echo-reply') {
			const endTime = performance.now();
			const timeMs = endTime - (packet.timestamp || endTime);
			const seq = packet.seq || 0;

			// Entferne den Extinct-Listener für diese UUID
			SimulationEventBus.getInstance().offExtinct(packet.timeoutUuid);

			this.results.push({
				seq: seq,
				ttl: ippacket.header.ttl,
				targetIp: srcIp,
				timeMs: timeMs,
				success: true
			});

			// Terminal über erfolgreichen Empfang benachrichtigen
			this.emit('reply', {
				srcIp,
				seq,
				ttl: ippacket.header.ttl,
				timeMs
			});
		}
	}
}
