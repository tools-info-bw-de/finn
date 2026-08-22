export class ICMPService {
    networkLayer;
    logs = $state([]);
    results = $state([]);
    seqCounter = 0;
    constructor(networkLayer) {
        this.networkLayer = networkLayer;
    }
    sendPing(targetIp) {
        this.seqCounter++;
        const seq = this.seqCounter;
        const startTime = performance.now();
        this.logs.push(`PING ${targetIp} mit 32 Bytes Daten (seq=${seq}):`);
        const payload = {
            type: 'echo-request',
            seq: seq,
            timestamp: startTime
        };
        this.networkLayer.send(payload, targetIp, 'ICMP');
    }
    receive(packet, srcIp) {
        if (packet.type === 'echo-request') {
            const reply = {
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
            this.logs.push(`Antwort von ${srcIp}: bytes=32 seq=${packet.seq} Zeit=${timeMs.toFixed(2)} ms`);
            this.results.push({
                seq: packet.seq || 0,
                targetIp: srcIp,
                timeMs: timeMs,
                success: true
            });
        }
    }
}
