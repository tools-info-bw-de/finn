import { DataLinkLayer } from './DataLinkLayer.svelte';
import type { CableEndpoint, EthernetFrame } from './types';
import { SwitchPort } from './SwitchPort.ts';
import { settings } from '../states/settings.svelte';

export class Cable {
	public uuid: string;
	private endA?: CableEndpoint;
	private endB?: CableEndpoint;

	public highlighted = $state<boolean>(false);
	private currentlyTransmitting = $state<EthernetFrame[]>([]);
	private transmittingFromA = $state<boolean>(false);

	constructor(a: CableEndpoint, b: CableEndpoint) {
		this.uuid = crypto.randomUUID();
		this.endA = a;
		this.endB = b;
		a.cable = this;
		b.cable = this;
	}

	public getOtherEndpoint(endpoint: CableEndpoint): DataLinkLayer | SwitchPort | undefined {
		let ce;
		if (endpoint === this.endA) {
			ce = this.endB;
		} else if (endpoint === this.endB) {
			ce = this.endA;
		}

		if (!ce) {
			console.warn('Cable.getOtherEndpoint: Endpoint not found on this cable.', endpoint, this);
		}

		if (ce instanceof DataLinkLayer) {
			return ce.upperLayer as DataLinkLayer;
		} else if (ce instanceof SwitchPort) {
			return ce as SwitchPort;
		}
		return undefined;
	}

	public remove(): void {
		if (this.endA && this.endA instanceof DataLinkLayer) {
			this.endA.cable = undefined;
		} else if (this.endA && this.endA instanceof SwitchPort) {
			this.endA.switch.removeCable(this);
		}

		if (this.endB && this.endB instanceof DataLinkLayer) {
			this.endB.cable = undefined;
		} else if (this.endB && this.endB instanceof SwitchPort) {
			this.endB.switch.removeCable(this);
		}

		this.endA = undefined;
		this.endB = undefined;
	}

	public get isTransmitting(): boolean {
		return this.currentlyTransmitting.length > 0;
	}

	public get isTransmittingFromA(): boolean {
		return this.transmittingFromA;
	}

	public getTransmissionDelay(): number {
		const baseDelay = 1000; // Base delay in milliseconds
		const minDelay = 50; // Minimum delay in milliseconds
		const speedFactor = settings.speed / 100.0; // Convert speed percentage to a factor (0.0 to 1.0)
		return Math.max(baseDelay * (1 - speedFactor), minDelay); // Adjust delay based on speed setting
	}

	public transmit(sender: CableEndpoint, frame: EthernetFrame): void {
		this.currentlyTransmitting.push(frame);

		const receiver = sender === this.endA ? this.endB : this.endA;
		if (!receiver) {
			console.warn('No receiver connected to the cable.', this.uuid, this.endA, this.endB);
			return;
		}
		this.transmittingFromA = sender === this.endA;

		setTimeout(() => {
			this.currentlyTransmitting = this.currentlyTransmitting.filter((f) => f.uuid !== frame.uuid);
			receiver.receive(frame);
		}, this.getTransmissionDelay()); // Simulate transmission delay
	}
}
