import type { LayerInterface, EthernetFrame, IPPacket, ARPPacket, CableEndpoint } from './types';
import type { Cable } from './Cable.svelte';
import { NetworkConfig } from './NetworkConfig.svelte';
import { SimulationEventBus } from './SimulationEventBus';
import { getPacketTrackingId } from './helpers';

export type capturedPackage = {
	number: number;
	time: number;
	frame: EthernetFrame;
};

export class DataLinkLayer implements LayerInterface, CableEndpoint {
	public uuid: string = crypto.randomUUID();
	public config: NetworkConfig;
	public cable?: Cable;
	public upperLayer?: LayerInterface;

	public captureBuffer = $state<capturedPackage[]>([]);
	// Fortlaufende Paketnummer; nicht aus der Länge ableiten, da ab 200 Paketen alte entfernt werden
	private nextCaptureNumber = 1;

	constructor(config: NetworkConfig) {
		this.config = config;
	}

	private capture(frame: EthernetFrame): void {
		this.captureBuffer.push({
			number: this.nextCaptureNumber++,
			time: Date.now(),
			frame
		});
		if (this.captureBuffer.length > 200) {
			this.captureBuffer.shift(); // Remove the oldest frame if buffer exceeds 200 frames
		}
	}

	/** Leert den Mitschnitt (z. B. nach Änderung von IP/Netzmaske); Nummerierung beginnt neu. */
	public clearCaptureBuffer(): void {
		this.captureBuffer = [];
		this.nextCaptureNumber = 1;
	}

	public send(packet: IPPacket | ARPPacket, destinationMac: string, type: 'IP' | 'ARP'): void {
		const frame: EthernetFrame = {
			uuid: crypto.randomUUID(),
			header: {
				srcMac: this.config.macAddress,
				dstMac: destinationMac,
				type
			},
			payload: packet
		};

		this.capture(frame);

		if (this.cable) {
			this.cable.transmit(this, frame);
		} else {
			if (type === 'ARP') {
				const uuid = (packet as ARPPacket).uuid;
				if (uuid) SimulationEventBus.getInstance().resolveBranch(uuid);
			} else {
				const trackingId = getPacketTrackingId(packet as IPPacket);
				if (trackingId)
					SimulationEventBus.getInstance().reportFailure(
						trackingId,
						this.config,
						`Kein Kabel an der Netzwerkschnittstelle von ${this.config.ipAddress}.`
					);
			}
			console.warn('No cable connected to the DataLinkLayer.', this.config.macAddress);
		}
	}

	public receive(frame: EthernetFrame): void {
		this.capture(frame);

		if (
			frame.header.dstMac === this.config.macAddress ||
			frame.header.dstMac === 'FF:FF:FF:FF:FF:FF'
		) {
			this.upperLayer?.receive(frame.payload, frame.header.type);
		}
	}
}
