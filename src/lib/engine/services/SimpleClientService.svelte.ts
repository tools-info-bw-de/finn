import type { SimpleClientState } from '../types';
import { isValidIPv4 } from '../helpers';
import type { DNSService } from './DNSService.svelte';
import type { TCPConnection, TCPService } from './TCPService';

export type SimpleClientLogEntry = {
	type: 'connected' | 'disconnected' | 'sent' | 'received' | 'error';
	message: string;
};

export class SimpleClientService implements SimpleClientState {
	public serverAddress = $state<string>('');
	public serverPort = $state<number>(55555);
	public connectionStatus = $state<'disconnected' | 'connecting' | 'connected' | 'closing'>(
		'disconnected'
	);
	public log = $state<SimpleClientLogEntry[]>([]);
	private activeConnection: TCPConnection | null = null;
	private sendingMessage = false;
	private closeWhenDrained = false;
	private connectionAttempt = 0;
	private pendingMessages: string[] = [];
	private detachConnectionListeners: (() => void)[] = [];

	constructor(
		private readonly tcp: TCPService,
		private readonly dns: DNSService
	) {}

	public async connect(port: number): Promise<void> {
		if (this.connectionStatus !== 'disconnected') return;
		this.connectionStatus = 'connecting';
		const attempt = ++this.connectionAttempt;
		let ip: string;
		try {
			ip = await this.dns.resolveAddress(this.serverAddress.trim());
		} catch (error) {
			if (attempt !== this.connectionAttempt) return;
			this.connectionStatus = 'disconnected';
			this.addLog(
				'error',
				error instanceof Error ? error.message : 'DNS-Auflösung fehlgeschlagen.'
			);
			return;
		}
		if (attempt !== this.connectionAttempt) return;
		if (!isValidIPv4(ip)) {
			this.addLog('error', 'DNS-Auflösung hat keine gültige IPv4-Adresse geliefert.');
			this.connectionStatus = 'disconnected';
			return;
		}

		this.closeWhenDrained = false;
		try {
			const pending: { connection?: TCPConnection; error?: Error } = {};
			const connection = this.tcp.connect(
				ip,
				port,
				() => {
					if (attempt !== this.connectionAttempt) return;
					this.connectionStatus = 'connected';
					this.addLog('connected', `Verbunden mit ${ip}:${port}`);
					if (this.closeWhenDrained) this.closeConnection();
					else this.sendNextMessage();
				},
				(error) => {
					if (pending.connection) this.finishConnection(pending.connection, 'error', error.message);
					else pending.error = error;
				}
			);
			pending.connection = connection;
			if (pending.error) {
				this.connectionStatus = 'disconnected';
				this.addLog('error', pending.error.message);
				return;
			}
			this.activeConnection = connection;
			this.serverPort = port;
			this.detachConnectionListeners = [
				connection.onData((payload) => {
					if (this.activeConnection === connection)
						this.addLog('received', new TextDecoder().decode(payload));
				}),
				connection.onClose(() =>
					this.finishConnection(connection, 'disconnected', 'Verbindung geschlossen.')
				),
				connection.onError((error) => this.finishConnection(connection, 'error', error.message))
			];
		} catch (error) {
			this.connectionStatus = 'disconnected';
			this.addLog(
				'error',
				error instanceof Error ? error.message : 'Verbindung konnte nicht gestartet werden.'
			);
		}
	}

	public send(message: string): void {
		if (!this.activeConnection || this.connectionStatus !== 'connected') {
			this.addLog('error', 'Es besteht keine Verbindung zum Server.');
			return;
		}
		if (message.length === 0) return;
		this.pendingMessages.push(message);
		this.sendNextMessage();
	}

	public disconnect(): void {
		if (!this.activeConnection) {
			if (this.connectionStatus === 'connecting') {
				this.connectionAttempt++;
				this.connectionStatus = 'disconnected';
			}
			return;
		}
		const wasConnecting = this.connectionStatus === 'connecting';
		this.closeWhenDrained = true;
		this.pendingMessages = [];
		this.connectionStatus = 'closing';
		if (!wasConnecting && !this.sendingMessage) this.closeConnection();
	}

	public dispose(): void {
		this.disconnect();
	}

	private addLog(type: SimpleClientLogEntry['type'], message: string): void {
		this.log.push({ type, message });
	}

	private sendNextMessage(): void {
		if (this.sendingMessage || !this.activeConnection) return;
		if (this.closeWhenDrained && this.pendingMessages.length === 0) {
			this.closeConnection();
			return;
		}
		if (this.connectionStatus !== 'connected') return;
		const message = this.pendingMessages.shift();
		if (message === undefined) return;
		const connection = this.activeConnection;
		this.sendingMessage = true;
		try {
			this.addLog('sent', message);
			connection.send(new TextEncoder().encode(message), () => {
				if (this.activeConnection !== connection) return;
				this.sendingMessage = false;
				this.sendNextMessage();
			});
		} catch (error) {
			this.sendingMessage = false;
			this.addLog(
				'error',
				error instanceof Error ? error.message : 'Nachricht konnte nicht gesendet werden.'
			);
		}
	}

	private closeConnection(): void {
		if (!this.activeConnection || this.connectionStatus === 'connecting' || this.sendingMessage)
			return;
		try {
			this.activeConnection.close();
		} catch (error) {
			this.closeWhenDrained = false;
			this.connectionStatus = 'connected';
			this.addLog(
				'error',
				error instanceof Error ? error.message : 'Verbindung konnte nicht geschlossen werden.'
			);
		}
	}

	private finishConnection(
		connection: TCPConnection,
		type: 'disconnected' | 'error',
		message: string
	): void {
		if (this.activeConnection !== connection) return;
		for (const detach of this.detachConnectionListeners) detach();
		this.detachConnectionListeners = [];
		this.activeConnection = null;
		this.connectionAttempt++;
		this.connectionStatus = 'disconnected';
		this.sendingMessage = false;
		this.closeWhenDrained = false;
		this.pendingMessages = [];
		this.addLog(type, message);
	}
}
