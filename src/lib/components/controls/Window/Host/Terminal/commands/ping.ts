import { isSameSubnet } from '$lib/engine/helpers';
import type { CommandHandler } from '../types';

export const pingCommand: CommandHandler = ({ term, args, currentNode, signal }) => {
	const targetIp = args[0];

	if (!targetIp) {
		term.writeln('\x1b[31mFehler: IP-Adresse angeben (z.B. ping 192.168.1.10)\x1b[0m');
		return Promise.resolve();
	}

	//Hier (!) prüfen, ob die Ziel-IP erreicht werden kann!
	const isLocal = isSameSubnet(currentNode.config.ipAddress, targetIp, currentNode.config.netmask);
	if (!isLocal && !currentNode.config.gateway) {
		term.writeln(`\x1b[31mFehler: Ziel-adresse nicht erreichbar.\x1b[0m`);
		return Promise.resolve();
	}

	term.writeln(`PING ${targetIp}:`);

	return new Promise<void>((resolve) => {
		let pingsSent = 0;
		const MAX_PINGS = 4;

		const replies: { srcIp: string; seq: number; timeMs: number; ttl: number }[] = [];

		// Event-Handler für Antworten
		const handleReply = (data: { srcIp: string; seq: number; timeMs: number; ttl: number }) => {
			replies.push(data);
			term.writeln(
				`From ${data.srcIp}: icmp_seq=${data.seq} ttl=${data.ttl} time=\x1b[32m${data.timeMs.toFixed(2)} ms\x1b[0m`
			);

			if (pingsSent >= MAX_PINGS || signal.aborted) {
				cleanup();
				resolve();
				return;
			}

			currentNode.icmp.sendPing(targetIp, pingsSent + 1);
			pingsSent++;
		};

		// Event-Handler für Timeouts
		const handleTimeout = (data: { seq: number }) => {
			setTimeout(() => {
				term.writeln(`Zeitüberschreitung der Anforderung (seq=${data.seq}).`);
				cleanup();
				resolve();
			}, 1000);
		};

		const handleMessage = (message: string) => {
			let errorMsg = '';
			if (message === 'ENETUNREACH') {
				// TODO: Prüfen, ob diese Fehlercodes noch stimmen
				errorMsg = 'Zieladresse nicht erreichbar.';
			} else if (message === 'ERROR') {
				errorMsg = 'Unbekannter Fehler beim Senden des Pakets.';
			}
			if (errorMsg !== '') {
				term.writeln(`\x1b[31m${errorMsg}\x1b[0m`);
				cleanup();
				resolve();
			} else {
				term.writeln(message);
			}
		};

		const cleanup = () => {
			currentNode.icmp.off('reply', handleReply);
			currentNode.icmp.off('timeout', handleTimeout);

			term.writeln(`\n--- ${targetIp} ping statistics ---`);
			term.writeln(
				`${pingsSent} packets transmitted, ${replies.length} received, ${
					((pingsSent - replies.length) * 100) / pingsSent
				}% lost`
			);
			term.writeln(
				`rtt min/avg/max = ${replies.length > 0 ? Math.min(...replies.map((r) => r.timeMs)).toFixed(2) : 0}/${replies.length > 0 ? (replies.reduce((sum, r) => sum + r.timeMs, 0) / replies.length).toFixed(2) : 0}/${replies.length > 0 ? Math.max(...replies.map((r) => r.timeMs)).toFixed(2) : 0} ms`
			);
		};

		signal.addEventListener('abort', () => {
			cleanup();
			resolve();
		});

		currentNode.icmp.on('reply', handleReply);
		currentNode.icmp.on('timeout', handleTimeout);
		currentNode.icmp.on('message', handleMessage);

		// Erstes Paket sofort senden
		currentNode.icmp.sendPing(targetIp, 1);
		pingsSent++;
	});
};
