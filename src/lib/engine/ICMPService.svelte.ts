import type { NetworkLayer } from './NetworkLayer';
import type { ICMPPacket } from './types';

export interface PingResult {
	seq: number;
	targetIp: string;
	timeMs: number;
	success: boolean;
}

export class ICMPService {
	private networkLayer: NetworkLayer;

	public logs = $state<string[]>([]);
	public results = $state<PingResult[]>([]);
	private seqCounter = 0;

	constructor(networkLayer: NetworkLayer) {
		this.networkLayer = networkLayer;
	}

	public sendPing(targetIp: string): void {
		console.log(`Sending ping to ${targetIp}`);
		this.seqCounter++;
		const seq = this.seqCounter;
		const startTime = performance.now();

		this.logs.push(`PING ${targetIp} mit 32 Bytes Daten (seq=${seq}):`);

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

			this.logs.push(
				`Antwort von ${srcIp}: bytes=32 seq=${packet.seq} Zeit=${timeMs.toFixed(2)} ms`
			);

			this.results.push({
				seq: packet.seq || 0,
				targetIp: srcIp,
				timeMs: timeMs,
				success: true
			});
		}
	}
}
