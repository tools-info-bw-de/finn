import type { CommandHandler } from '../types';

export const pingCommand: CommandHandler = ({ term, args, currentNode, signal }) => {
	const targetIp = args[0];

	if (!targetIp) {
		term.writeln('\x1b[31mFehler: IP-Adresse angeben (z.B. ping 192.168.1.10)\x1b[0m');
		return Promise.resolve();
	}

	term.writeln(`PING ${targetIp} mit 32 Bytes Daten:`);

	return new Promise<void>((resolve) => {
		let pingsSent = 0;
		const MAX_PINGS = 4;
		let timerId: ReturnType<typeof setInterval> | null = null;

		// Event-Handler für Antworten
		const handleReply = (data: { srcIp: string; seq: number; timeMs: number }) => {
			term.writeln(
				`Antwort von ${data.srcIp}: bytes=32 seq=${data.seq} Zeit=\x1b[32m${data.timeMs.toFixed(2)} ms\x1b[0m`
			);
		};

		// Event-Handler für Timeouts
		const handleTimeout = (data: { seq: number }) => {
			term.writeln(`Zeitüberschreitung der Anforderung (seq=${data.seq}).`);
		};

		const cleanup = () => {
			if (timerId) clearInterval(timerId);
			currentNode.icmp.off('reply', handleReply);
			currentNode.icmp.off('timeout', handleTimeout);
		};

		signal.addEventListener('abort', () => {
			cleanup();
			resolve();
		});

		currentNode.icmp.on('reply', handleReply);
		currentNode.icmp.on('timeout', handleTimeout);

		// Erstes Paket sofort senden
		console.log('Sending first ping to', targetIp);
		currentNode.icmp.sendPing(targetIp);
		pingsSent++;

		// Alle 1000ms weitere Pings senden
		timerId = setInterval(() => {
			if (pingsSent >= MAX_PINGS || signal.aborted) {
				cleanup();
				resolve();
				return;
			}

			currentNode.icmp.sendPing(targetIp);
			pingsSent++;
		}, 1000);
	});
};
