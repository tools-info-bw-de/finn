import type { NetworkLayer } from './NetworkLayer';
import type { IPPacket, ProtocolHandler, UDPDatagram } from './types';
import { SimulationEventBus } from './SimulationEventBus';

export interface UDPPortHandler {
	receive(datagram: UDPDatagram, srcIp: string): void;
}

export interface UDPPortBinding {
	port: number;
	release: () => void;
}

const FIRST_EPHEMERAL_PORT = 49152;
const LAST_PORT = 65535;

export class UDPService implements ProtocolHandler {
	private portHandlers = new Map<number, UDPPortHandler>();
	private nextEphemeralPort = FIRST_EPHEMERAL_PORT;
	private networkLayer: NetworkLayer;

	/** Erstellt den UDP-Dienst für die angegebene Netzwerkschicht. */
	constructor(networkLayer: NetworkLayer) {
		this.networkLayer = networkLayer;
	}

	/** Belegt einen UDP-Port und gibt eine Funktion zum Freigeben zurück. */
	public bindPort(port: number, handler: UDPPortHandler): () => void {
		if (!Number.isInteger(port) || port < 1 || port > LAST_PORT) {
			throw new RangeError(`Ungültiger UDP-Port: ${port}`);
		}
		if (this.portHandlers.has(port)) {
			throw new Error(`UDP-Port ${port} ist bereits belegt.`);
		}

		this.portHandlers.set(port, handler);
		return () => {
			if (this.portHandlers.get(port) === handler) this.portHandlers.delete(port);
		};
	}

	/** Sucht einen freien dynamischen Port und belegt ihn für den Handler. */
	public bindEphemeralPort(handler: UDPPortHandler): UDPPortBinding {
		const portCount = LAST_PORT - FIRST_EPHEMERAL_PORT + 1;

		for (let attempt = 0; attempt < portCount; attempt++) {
			const port = this.nextEphemeralPort;
			this.nextEphemeralPort = port === LAST_PORT ? FIRST_EPHEMERAL_PORT : port + 1;

			if (!this.portHandlers.has(port)) {
				return { port, release: this.bindPort(port, handler) };
			}
		}

		throw new Error('Keine freien dynamischen UDP-Ports verfügbar.');
	}

	/** Sendet ein UDP-Datagramm an die angegebene IP-Adresse. */
	public send(datagram: UDPDatagram, destinationIp: string): void {
		this.networkLayer.send(datagram, destinationIp, 'UDP');
	}

	/** Prüft ein eingehendes Paket und leitet das Datagramm an seinen Port-Handler weiter. */
	public receive(data: unknown, srcIp: string): void {
		if (typeof data !== 'object' || data === null) return;

		const packet = data as IPPacket;
		if (!packet.header || packet.header.protocol !== 'UDP') return;

		const datagram = packet.payload as UDPDatagram;
		if (!datagram.header || typeof datagram.header.dstPort !== 'number') return;

		const handler = this.portHandlers.get(datagram.header.dstPort);
		if (handler) {
			handler.receive(datagram, srcIp);
		} else if (datagram.header.timeoutUuid) {
			SimulationEventBus.getInstance().emitExtinct(datagram.header.timeoutUuid);
		}
	}
}
