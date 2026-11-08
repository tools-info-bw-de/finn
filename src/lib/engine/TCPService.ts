import type { NetworkLayer } from './NetworkLayer';
import type { ICMPPacket, IPPacket, ProtocolHandler, TCPSegment } from './types';
import { SimulationEventBus } from './SimulationEventBus';

const FIRST_EPHEMERAL_PORT = 49152;
const LAST_PORT = 65535;
const RETRY_DELAY_MS = 1000;
const HANDSHAKE_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 3;

export interface TCPConnection {
	readonly localPort: number;
	readonly remoteIp: string;
	readonly remotePort: number;
	send(payload: Uint8Array, onAcknowledged?: () => void, onError?: (error: Error) => void): void;
	close(onClosed?: () => void, onError?: (error: Error) => void): void;
	onData(callback: (payload: Uint8Array) => void): () => void;
	onClose(callback: () => void): () => void;
	onError(callback: (error: Error) => void): () => void;
}

export type TCPConnectionListener = (connection: TCPConnection) => void;

type ConnectionPhase = 'syn-sent' | 'syn-received' | 'established' | 'closing' | 'closed';

interface PendingSegment {
	segment: TCPSegment;
	expectedAck: number;
	attempts: number;
	parentId?: string;
	trackingId?: string;
	timer?: ReturnType<typeof setTimeout>;
	onAcknowledged?: () => void;
	onError?: (error: Error) => void;
}

interface PendingTransientSegment {
	state: ConnectionState;
	timer?: ReturnType<typeof setTimeout>;
}

interface ConnectionState {
	localIp: string;
	localPort: number;
	remoteIp: string;
	remotePort: number;
	phase: ConnectionPhase;
	sendSequence: number;
	receiveSequence: number;
	outstanding?: PendingSegment;
	remoteClosed: boolean;
	localCloseRequested: boolean;
	localFinAcknowledged: boolean;
	connectCallback?: (connection: TCPConnection) => void;
	acceptCallback?: TCPConnectionListener;
	connectError?: (error: Error) => void;
	dataListeners: Set<(payload: Uint8Array) => void>;
	closeListeners: Set<() => void>;
	errorListeners: Set<(error: Error) => void>;
	handle: TCPConnection;
}

export class TCPService implements ProtocolHandler {
	private readonly networkLayer: NetworkLayer;
	private readonly listeners = new Map<number, TCPConnectionListener>();
	private readonly connections = new Map<string, ConnectionState>();
	private readonly ephemeralPorts = new Set<number>();
	private readonly transientSegments = new Map<string, PendingTransientSegment>();
	private nextEphemeralPort = FIRST_EPHEMERAL_PORT;
	private nextInitialSequence = 1;

	constructor(networkLayer: NetworkLayer) {
		this.networkLayer = networkLayer;
	}

	public listen(port: number, listener: TCPConnectionListener): () => void {
		this.validatePort(port);
		if (this.listeners.has(port)) throw new Error(`TCP-Port ${port} ist bereits belegt.`);

		this.listeners.set(port, listener);
		return () => {
			if (this.listeners.get(port) === listener) this.listeners.delete(port);
		};
	}

	public connect(
		remoteIp: string,
		remotePort: number,
		onConnected: (connection: TCPConnection) => void,
		onError?: (error: Error) => void
	): TCPConnection {
		this.validatePort(remotePort);
		const localPort = this.allocateEphemeralPort();
		const state = this.createConnectionState(
			localPort,
			remoteIp,
			remotePort,
			'syn-sent',
			this.allocateInitialSequence()
		);
		state.connectCallback = onConnected;
		state.connectError = onError;
		this.connections.set(this.connectionKey(state.localIp, localPort, remoteIp, remotePort), state);

		const syn = this.createSegment(state, { SYN: true });
		state.sendSequence = this.advanceSequence(state.sendSequence, 1);
		this.sendReliable(state, syn, () => {});
		return state.handle;
	}

	public receive(data: unknown, srcIp: string): void {
		if (typeof data !== 'object' || data === null) return;
		const packet = data as IPPacket;
		if (!packet.header || packet.header.protocol !== 'TCP') return;

		const segment = packet.payload as TCPSegment;
		if (!segment?.header || !segment.header.flags || typeof segment.header.seqNum !== 'number') {
			return;
		}

		const localIp = this.networkLayer.config.ipAddress;
		const key = this.connectionKey(localIp, segment.header.dstPort, srcIp, segment.header.srcPort);
		let state = this.connections.get(key);

		if (!state) {
			if (segment.header.flags.SYN && !segment.header.flags.ACK) {
				const listener = this.listeners.get(segment.header.dstPort);
				if (listener) {
					state = this.acceptSyn(segment, srcIp, listener);
					SimulationEventBus.getInstance().emitDelivered(segment.header.timeoutUuid);
					return;
				}
			}
			if (segment.header.timeoutUuid) {
				SimulationEventBus.getInstance().reportDiagnostic(
					segment.header.timeoutUuid,
					this.networkLayer.config,
					`Kein TCP-Endpunkt für Port ${segment.header.dstPort} auf ${localIp}.`
				);
				SimulationEventBus.getInstance().emitExtinct(segment.header.timeoutUuid);
			}
			return;
		}

		SimulationEventBus.getInstance().emitDelivered(segment.header.timeoutUuid);

		if (state.phase === 'syn-sent') {
			this.receiveSynAck(state, segment);
			return;
		}
		if (state.phase === 'syn-received') {
			if (segment.header.flags.SYN && !segment.header.flags.ACK) {
				this.resendPending(state);
				return;
			}
			if (
				!segment.header.flags.ACK ||
				segment.header.seqNum !== state.receiveSequence ||
				!this.acknowledge(state, segment.header.ackNum)
			) {
				return;
			}
			state.phase = 'established';
			state.acceptCallback?.(state.handle);
		}
		if (state.phase === 'closed') return;

		if (segment.header.flags.RST) {
			this.failConnection(state, new Error('TCP-Verbindung wurde zurückgesetzt.'));
			return;
		}
		if (
			segment.header.flags.SYN &&
			segment.header.flags.ACK &&
			this.advanceSequence(segment.header.seqNum, 1) === state.receiveSequence
		) {
			this.sendAcknowledgement(state);
			return;
		}

		if (segment.header.flags.ACK) this.acknowledge(state, segment.header.ackNum);

		const payloadLength = segment.payload?.length ?? 0;
		const hasFin = segment.header.flags.FIN;
		if (payloadLength === 0 && !hasFin) return;

		if (segment.header.seqNum !== state.receiveSequence) {
			this.sendAcknowledgement(state);
			return;
		}

		if (payloadLength > 0) {
			state.receiveSequence = this.advanceSequence(state.receiveSequence, payloadLength);
			const payload = segment.payload.slice();
			state.dataListeners.forEach((callback) => callback(payload));
		}

		if (hasFin) {
			state.receiveSequence = this.advanceSequence(state.receiveSequence, 1);
			state.remoteClosed = true;
			state.closeListeners.forEach((callback) => callback());
		}

		this.sendAcknowledgement(state);
		if (hasFin && !state.localCloseRequested) this.sendFin(state);
		if (state.remoteClosed && state.localFinAcknowledged) this.finishConnection(state);
	}

	public handleIcmpError(packet: ICMPPacket, _srcIp: string): void {
		if (packet.original?.protocol !== 'TCP') return;

		for (const state of this.connections.values()) {
			if (
				state.localPort === packet.original.srcPort &&
				state.remotePort === packet.original.dstPort &&
				state.outstanding?.trackingId === packet.timeoutUuid
			) {
				this.failConnection(
					state,
					new Error(
						state.phase === 'syn-sent'
							? 'Timeout: Verbindungsaufbau gescheitert'
							: 'ICMP-Fehler für TCP-Segment.'
					)
				);
				return;
			}
		}
	}

	public dispose(): void {
		for (const state of [...this.connections.values()]) {
			this.failConnection(state, new Error('TCP-Dienst wurde beendet.'));
		}
		this.listeners.clear();
		this.ephemeralPorts.clear();
	}

	private acceptSyn(
		segment: TCPSegment,
		remoteIp: string,
		listener: TCPConnectionListener
	): ConnectionState {
		const state = this.createConnectionState(
			segment.header.dstPort,
			remoteIp,
			segment.header.srcPort,
			'syn-received',
			this.allocateInitialSequence()
		);
		state.receiveSequence = this.advanceSequence(segment.header.seqNum, 1);
		state.acceptCallback = listener;
		this.connections.set(
			this.connectionKey(state.localIp, state.localPort, remoteIp, state.remotePort),
			state
		);

		const synAck = this.createSegment(state, { SYN: true, ACK: true });
		state.sendSequence = this.advanceSequence(state.sendSequence, 1);
		this.sendReliable(state, synAck, undefined, undefined, segment.header.timeoutUuid);
		return state;
	}

	private receiveSynAck(state: ConnectionState, segment: TCPSegment): void {
		if (
			!segment.header.flags.SYN ||
			!segment.header.flags.ACK ||
			!this.acknowledge(state, segment.header.ackNum)
		) {
			return;
		}

		state.receiveSequence = this.advanceSequence(segment.header.seqNum, 1);
		state.phase = 'established';
		state.connectError = undefined;
		this.sendAcknowledgement(state);
		state.connectCallback?.(state.handle);
	}

	private createConnectionState(
		localPort: number,
		remoteIp: string,
		remotePort: number,
		phase: ConnectionPhase,
		sendSequence: number
	): ConnectionState {
		const state = {
			localIp: this.networkLayer.config.ipAddress,
			localPort,
			remoteIp,
			remotePort,
			phase,
			sendSequence,
			receiveSequence: 0,
			remoteClosed: false,
			localCloseRequested: false,
			localFinAcknowledged: false,
			dataListeners: new Set<(payload: Uint8Array) => void>(),
			closeListeners: new Set<() => void>(),
			errorListeners: new Set<(error: Error) => void>(),
			handle: undefined as unknown as TCPConnection
		} satisfies ConnectionState;

		state.handle = {
			localPort,
			remoteIp,
			remotePort,
			send: (payload, onAcknowledged, onError) =>
				this.sendData(state, payload, onAcknowledged, onError),
			close: (onClosed, onError) => this.closeConnection(state, onClosed, onError),
			onData: (callback) => this.addListener(state.dataListeners, callback),
			onClose: (callback) => this.addListener(state.closeListeners, callback),
			onError: (callback) => this.addListener(state.errorListeners, callback)
		};
		return state;
	}

	private sendData(
		state: ConnectionState,
		payload: Uint8Array,
		onAcknowledged?: () => void,
		onError?: (error: Error) => void
	): void {
		if (state.phase !== 'established' || state.localCloseRequested) {
			throw new Error('TCP-Verbindung ist nicht für Nutzdaten verfügbar.');
		}
		if (state.outstanding) throw new Error('Es wartet bereits ein TCP-Segment auf Bestätigung.');
		if (payload.length === 0) throw new RangeError('TCP-Nutzdaten dürfen nicht leer sein.');

		const segment = this.createSegment(state, { ACK: true }, payload.slice());
		state.sendSequence = this.advanceSequence(state.sendSequence, payload.length);
		this.sendReliable(state, segment, onAcknowledged, onError);
	}

	private closeConnection(
		state: ConnectionState,
		onClosed?: () => void,
		onError?: (error: Error) => void
	): void {
		if (state.phase !== 'established' || state.outstanding) {
			throw new Error('TCP-Verbindung kann gerade nicht geschlossen werden.');
		}
		if (onClosed) state.closeListeners.add(onClosed);
		state.localCloseRequested = true;
		this.sendFin(state, onError);
	}

	private sendFin(state: ConnectionState, onError?: (error: Error) => void): void {
		if (state.outstanding || state.phase === 'closed') return;
		state.localCloseRequested = true;
		state.phase = 'closing';
		const fin = this.createSegment(state, { FIN: true, ACK: true });
		state.sendSequence = this.advanceSequence(state.sendSequence, 1);
		this.sendReliable(
			state,
			fin,
			() => {
				state.localFinAcknowledged = true;
				if (state.remoteClosed) this.finishConnection(state);
			},
			onError
		);
	}

	private sendAcknowledgement(state: ConnectionState): void {
		const segment = this.createSegment(state, { ACK: true });
		this.sendTransient(state, segment, 1);
	}

	private sendTransient(state: ConnectionState, template: TCPSegment, attempts: number): void {
		const bus = SimulationEventBus.getInstance();
		const trackingId = crypto.randomUUID();
		const segment: TCPSegment = {
			...template,
			header: { ...template.header, timeoutUuid: trackingId }
		};
		const pending: PendingTransientSegment = { state };
		this.transientSegments.set(trackingId, pending);
		bus.registerOrigin(trackingId, this.networkLayer.config, () =>
			this.failConnection(state, new Error('TCP-Verbindung wurde abgebrochen.'))
		);
		const retry = (_id: string, message?: string) => {
			if (message) {
				this.failConnection(state, new Error(message));
				return;
			}
			pending.timer = setTimeout(() => {
				bus.forgetOrigin(trackingId);
				this.transientSegments.delete(trackingId);
				bus.offDelivered(trackingId);
				if (state.phase === 'closed') return;
				if (attempts >= MAX_ATTEMPTS) {
					this.failConnection(state, new Error('TCP-ACK konnte nicht zugestellt werden.'));
					return;
				}
				this.sendTransient(state, template, attempts + 1);
			}, RETRY_DELAY_MS);
		};

		bus.onExtinct(trackingId, retry);
		bus.onDelivered(trackingId, () => {
			bus.forgetOrigin(trackingId);
			if (pending.timer) clearTimeout(pending.timer);
			this.transientSegments.delete(trackingId);
			bus.offExtinct(trackingId);
		});
		this.networkLayer.send(segment, state.remoteIp, 'TCP');
	}

	private sendReliable(
		state: ConnectionState,
		segment: TCPSegment,
		onAcknowledged?: () => void,
		onError?: (error: Error) => void,
		parentId?: string
	): void {
		const sequenceLength = this.sequenceLength(segment);
		const pending: PendingSegment = {
			segment,
			expectedAck: this.advanceSequence(segment.header.seqNum, sequenceLength),
			attempts: 0,
			parentId,
			onAcknowledged,
			onError
		};
		state.outstanding = pending;
		this.sendAttempt(state, pending);
	}

	private sendAttempt(state: ConnectionState, pending: PendingSegment): void {
		if (state.outstanding !== pending) return;
		pending.attempts++;
		const bus = SimulationEventBus.getInstance();
		const trackingId = crypto.randomUUID();
		pending.trackingId = trackingId;
		bus.registerOrigin(
			trackingId,
			this.networkLayer.config,
			() => this.failConnection(state, new Error('TCP-Verbindung wurde abgebrochen.')),
			pending.parentId
		);
		const segment: TCPSegment = {
			...pending.segment,
			header: { ...pending.segment.header, timeoutUuid: trackingId }
		};

		const retry = () => {
			pending.timer = undefined;
			if (state.outstanding !== pending || pending.trackingId !== trackingId) return;
			bus.offExtinct(trackingId);
			bus.offDelivered(trackingId);
			bus.forgetOrigin(trackingId);
			if (pending.segment.header.flags.SYN) {
				this.failConnection(state, new Error('Timeout: Verbindungsaufbau gescheitert'));
				return;
			}
			if (pending.attempts >= MAX_ATTEMPTS) {
				this.failConnection(state, new Error('TCP-Segment nach drei Versuchen nicht bestätigt.'));
				return;
			}
			this.sendAttempt(state, pending);
		};
		const scheduleRetry = (delay = RETRY_DELAY_MS) => {
			if (pending.timer) clearTimeout(pending.timer);
			pending.timer = setTimeout(retry, delay);
		};

		let extinct = false;
		const onExtinct = (_id: string, message?: string) => {
			if (state.outstanding !== pending || pending.trackingId !== trackingId) return;
			extinct = true;
			if (pending.parentId) bus.emitExtinct(pending.parentId);
			if (message) {
				this.failConnection(state, new Error(message));
				return;
			}
			scheduleRetry();
		};
		bus.onExtinct(trackingId, onExtinct);
		if (segment.header.flags.SYN && !segment.header.flags.ACK) {
			bus.onDelivered(trackingId, () => {
				if (!extinct && state.outstanding === pending && pending.trackingId === trackingId) {
					bus.onExtinct(trackingId, onExtinct);
				}
			});
		}
		if (segment.header.flags.SYN) scheduleRetry(HANDSHAKE_TIMEOUT_MS);
		this.networkLayer.send(segment, state.remoteIp, 'TCP');
	}

	private resendPending(state: ConnectionState): void {
		const pending = state.outstanding;
		if (!pending) return;
		if (pending.timer) clearTimeout(pending.timer);
		if (pending.trackingId) {
			SimulationEventBus.getInstance().offExtinct(pending.trackingId);
			SimulationEventBus.getInstance().offDelivered(pending.trackingId);
			SimulationEventBus.getInstance().forgetOrigin(pending.trackingId);
		}
		pending.trackingId = undefined;
		if (pending.segment.header.flags.SYN) {
			this.failConnection(state, new Error('Timeout: Verbindungsaufbau gescheitert'));
			return;
		}
		if (pending.attempts >= MAX_ATTEMPTS) {
			this.failConnection(state, new Error('TCP-Segment nach drei Versuchen verloren.'));
			return;
		}
		this.sendAttempt(state, pending);
	}

	private acknowledge(state: ConnectionState, ackNum: number): boolean {
		const pending = state.outstanding;
		if (!pending || ackNum !== pending.expectedAck) return false;

		if (pending.timer) clearTimeout(pending.timer);
		if (pending.trackingId) {
			SimulationEventBus.getInstance().offExtinct(pending.trackingId);
			SimulationEventBus.getInstance().offDelivered(pending.trackingId);
			SimulationEventBus.getInstance().forgetOrigin(pending.trackingId);
		}
		state.outstanding = undefined;
		pending.onAcknowledged?.();
		return true;
	}

	private createSegment(
		state: ConnectionState,
		flags: Partial<TCPSegment['header']['flags']>,
		payload = new Uint8Array()
	): TCPSegment {
		return {
			header: {
				srcPort: state.localPort,
				dstPort: state.remotePort,
				seqNum: state.sendSequence,
				ackNum: state.receiveSequence,
				timeoutUuid: '',
				flags: { SYN: false, ACK: false, FIN: false, RST: false, ...flags }
			},
			payload
		};
	}

	private sequenceLength(segment: TCPSegment): number {
		return segment.payload.length + (segment.header.flags.SYN || segment.header.flags.FIN ? 1 : 0);
	}

	private advanceSequence(sequence: number, length: number): number {
		return (sequence + length) >>> 0;
	}

	private allocateInitialSequence(): number {
		const sequence = this.nextInitialSequence;
		this.nextInitialSequence = this.advanceSequence(this.nextInitialSequence, 1000);
		return sequence;
	}

	private addListener<T>(listeners: Set<T>, callback: T): () => void {
		listeners.add(callback);
		return () => listeners.delete(callback);
	}

	private failConnection(state: ConnectionState, error: Error): void {
		if (state.phase === 'closed') return;
		state.phase = 'closed';
		const pending = state.outstanding;
		if (pending?.timer) clearTimeout(pending.timer);
		if (pending?.trackingId) {
			SimulationEventBus.getInstance().offExtinct(pending.trackingId);
			SimulationEventBus.getInstance().offDelivered(pending.trackingId);
			SimulationEventBus.getInstance().forgetOrigin(pending.trackingId);
		}
		state.outstanding = undefined;
		this.clearTransientSegments(state);
		state.connectError?.(error);
		pending?.onError?.(error);
		state.errorListeners.forEach((callback) => callback(error));
		this.removeConnection(state);
	}

	private finishConnection(state: ConnectionState): void {
		state.phase = 'closed';
		this.clearTransientSegments(state);
		this.removeConnection(state);
	}

	private clearTransientSegments(state: ConnectionState): void {
		const bus = SimulationEventBus.getInstance();
		for (const [trackingId, pending] of this.transientSegments) {
			if (pending.state !== state) continue;
			if (pending.timer) clearTimeout(pending.timer);
			bus.offExtinct(trackingId);
			bus.offDelivered(trackingId);
			bus.forgetOrigin(trackingId);
			this.transientSegments.delete(trackingId);
		}
	}

	private removeConnection(state: ConnectionState): void {
		this.connections.delete(
			this.connectionKey(state.localIp, state.localPort, state.remoteIp, state.remotePort)
		);
		this.ephemeralPorts.delete(state.localPort);
	}

	private connectionKey(
		localIp: string,
		localPort: number,
		remoteIp: string,
		remotePort: number
	): string {
		return `${localIp}:${localPort}|${remoteIp}:${remotePort}`;
	}

	private validatePort(port: number): void {
		if (!Number.isInteger(port) || port < 1 || port > LAST_PORT) {
			throw new RangeError(`Ungültiger TCP-Port: ${port}`);
		}
	}

	private allocateEphemeralPort(): number {
		const portCount = LAST_PORT - FIRST_EPHEMERAL_PORT + 1;
		for (let attempt = 0; attempt < portCount; attempt++) {
			const port = this.nextEphemeralPort;
			this.nextEphemeralPort = port === LAST_PORT ? FIRST_EPHEMERAL_PORT : port + 1;
			if (!this.ephemeralPorts.has(port) && !this.listeners.has(port)) {
				this.ephemeralPorts.add(port);
				return port;
			}
		}
		throw new Error('Keine freien dynamischen TCP-Ports verfügbar.');
	}
}
