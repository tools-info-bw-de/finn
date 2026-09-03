import type { NetworkLayer } from './NetworkLayer';
import type { ICMPPacket } from './types';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

export interface PingResult {
	seq: number;
	targetIp: string;
	timeMs: number;
	success: boolean;
}

type PingReplyEvent = {
	srcIp: string;
	seq: number;
	timeMs: number;
};

type PingTimeoutEvent = {
	seq: number;
	targetIp: string;
};

type IcmpEventPayloads = {
	reply: PingReplyEvent;
	timeout: PingTimeoutEvent;
};

type IcmpEventName = keyof IcmpEventPayloads;
type EventCallback<EventName extends IcmpEventName> = (data: IcmpEventPayloads[EventName]) => void;
type StoredEventCallback = (data: unknown) => void;

export class ICMPService {
	private networkLayer: NetworkLayer;

	public logs = $state<string[]>([]);
	public results = $state<PingResult[]>([]);
	private seqCounter = 0;

	// Speichert Listener (z.B. vom Terminal) und offene Timeouts
	private listeners = new SvelteMap<IcmpEventName, Set<StoredEventCallback>>();
	private pendingTimeouts = new SvelteMap<number, ReturnType<typeof setTimeout>>();

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
	public sendPing(targetIp: string, timeoutMs = 2000): void {
		this.seqCounter++;
		const seq = this.seqCounter;
		const startTime = performance.now();

		this.logs.push(`PING ${targetIp} mit 32 Bytes Daten (seq=${seq}):`);

		// Timeout setzen: Falls nach timeoutMs keine Antwort über receive() kam
		const timeoutTimer = setTimeout(() => {
			if (this.pendingTimeouts.has(seq)) {
				this.pendingTimeouts.delete(seq);
				this.emit('timeout', { seq, targetIp });
			}
		}, timeoutMs);

		this.pendingTimeouts.set(seq, timeoutTimer);

		const payload: ICMPPacket = {
			type: 'echo-request',
			seq: seq,
			timestamp: startTime
		};

		this.networkLayer.send(payload, targetIp, 'ICMP');
	}

	public receive(packet: ICMPPacket, srcIp: string): void {
		if (packet.type === 'echo-request') {
			const reply: ICMPPacket = {
				type: 'echo-reply',
				seq: packet.seq,
				timestamp: packet.timestamp
			};
			this.networkLayer.send(reply, srcIp, 'ICMP');
			return;
		}

		if (packet.type === 'echo-reply') {
			const endTime = performance.now();
			const timeMs = endTime - (packet.timestamp || endTime);
			const seq = packet.seq || 0;

			// Timeout-Timer für diese Sequenz abbrechen
			const timer = this.pendingTimeouts.get(seq);
			if (timer) {
				clearTimeout(timer);
				this.pendingTimeouts.delete(seq);
			}

			this.logs.push(`Antwort von ${srcIp}: bytes=32 seq=${seq} Zeit=${timeMs.toFixed(2)} ms`);
			console.log(`Received ping reply from ${srcIp} in ${timeMs.toFixed(2)} ms`);

			this.results.push({
				seq: seq,
				targetIp: srcIp,
				timeMs: timeMs,
				success: true
			});

			// Terminal über erfolgreichen Empfang benachrichtigen
			this.emit('reply', {
				srcIp,
				seq,
				timeMs
			});
		}
	}
}
