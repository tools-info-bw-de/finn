import type { LayerInterface, EthernetFrame, IPPacket, ARPPacket, CableEndpoint } from './types';
import type { Cable } from './Cable.svelte';
import { HostConfig } from './HostConfig.svelte';

export class DataLinkLayer implements LayerInterface, CableEndpoint {
	public config: HostConfig;
	public cable?: Cable;
	public upperLayer?: LayerInterface;

	public captureBuffer = $state<EthernetFrame[]>([]);

	constructor(config: HostConfig) {
		this.config = config;
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

		this.captureBuffer.push(frame);
		if (this.captureBuffer.length > 100) {
			this.captureBuffer.shift(); // Remove the oldest frame if buffer exceeds 100 frames
		}

		if (this.cable) {
			this.cable.transmit(this, frame);
		} else {
			console.warn('No cable connected to the DataLinkLayer.', this.config.macAddress);
		}
	}

	public receive(frame: EthernetFrame): void {
		this.captureBuffer.push(frame);
		if (this.captureBuffer.length > 100) {
			this.captureBuffer.shift(); // Remove the oldest frame if buffer exceeds 100 frames
		}

		if (
			frame.header.dstMac === this.config.macAddress ||
			frame.header.dstMac === 'ff:ff:ff:ff:ff:ff'
		) {
			this.upperLayer?.receive(frame.payload, frame.header.type);
		}
	}
}
