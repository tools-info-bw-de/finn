import { SvelteMap } from 'svelte/reactivity';
import type { EchoConnectionState, EchoServerState } from '../types';
import type { TCPConnection, TCPService } from './TCPService';

export type EchoLogEntry = {
	type:
		'serverStarted' | 'serverStopped' | 'connectionOpened' | 'connectionClosed' | 'echo' | 'error';
	ip?: string;
	port?: number;
	message: string;
};

export class EchoServerService implements EchoServerState {
	public serverRunning = $state(false);
	public port = $state(55555);
	public log = $state<EchoLogEntry[]>([]);
	public connections = new SvelteMap<TCPConnection, EchoConnectionState>();
	private releaseListener: (() => void) | undefined;

	constructor(private readonly tcp: TCPService) {}

	public start(port: number): void {
		if (this.releaseListener) throw new Error('Echo-Server läuft bereits.');
		let active = true;
		const release = this.tcp.listen(port, (connection) => {
			if (active) {
				this.acceptConnection(connection);
			} else {
				try {
					connection.close();
				} catch {
					return;
				}
			}
		});
		this.releaseListener = () => {
			active = false;
			release();
		};
		this.port = port;
		this.serverRunning = true;
		this.log.push({ type: 'serverStarted', message: '' });
	}

	public stop(): void {
		if (!this.releaseListener) return;
		this.releaseListener();
		this.releaseListener = undefined;
		this.serverRunning = false;
		for (const state of [...this.connections.values()]) {
			state.closeWhenDrained = true;
			this.sendNext(state);
		}
		this.log.push({ type: 'serverStopped', message: '' });
	}

	public dispose(): void {
		this.releaseListener?.();
		this.releaseListener = undefined;
		this.serverRunning = false;
		for (const state of [...this.connections.values()]) this.removeConnection(state);
	}

	private acceptConnection(connection: TCPConnection): void {
		const state: EchoConnectionState = {
			connection,
			pendingPayloads: [],
			detachListeners: [],
			sending: false,
			closeWhenDrained: false
		};
		this.log.push({
			type: 'connectionOpened',
			ip: connection.remoteIp,
			port: connection.remotePort,
			message: ''
		});
		this.connections.set(connection, state);
		state.detachListeners.push(
			connection.onData((payload) => {
				if (state.closeWhenDrained) return;
				state.pendingPayloads.push(payload.slice());
				this.sendNext(state);
			}),
			connection.onClose(() => this.removeConnection(state)),
			connection.onError(() => this.removeConnection(state))
		);
	}

	private sendNext(state: EchoConnectionState): void {
		if (state.sending) return;
		const payload = state.pendingPayloads.shift();
		if (!payload) {
			if (state.closeWhenDrained) this.closeConnection(state);
			return;
		}
		state.sending = true;
		try {
			state.connection.send(
				payload,
				() => {
					state.sending = false;
					this.sendNext(state);
				},
				() => this.removeConnection(state)
			);
			this.log.push({
				type: 'echo',
				ip: state.connection.remoteIp,
				port: state.connection.remotePort,
				message: new TextDecoder().decode(payload)
			});
		} catch {
			this.removeConnection(state);
		}
	}

	private closeConnection(state: EchoConnectionState): void {
		try {
			state.connection.close(undefined, () => this.removeConnection(state));
		} catch {
			this.removeConnection(state);
		}
	}

	private removeConnection(state: EchoConnectionState): void {
		if (!this.connections.delete(state.connection)) return;
		for (const detach of state.detachListeners) detach();
		state.pendingPayloads.length = 0;
		this.log.push({
			type: 'connectionClosed',
			ip: state.connection.remoteIp,
			port: state.connection.remotePort,
			message: ''
		});
	}
}
