import { DataLinkLayer } from './DataLinkLayer.svelte';
import type { CableEndpoint, EthernetFrame } from './types';
import { SwitchPort } from './SwitchPort.ts';

export class Cable {
	public uuid: string;
	private endA?: CableEndpoint;
	private endB?: CableEndpoint;

	private currentlyTransmitting = $state<EthernetFrame[]>([]);

	constructor(a: CableEndpoint, b: CableEndpoint) {
		this.uuid = crypto.randomUUID();
		this.endA = a;
		this.endB = b;
		a.cable = this;
		b.cable = this;
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

	public transmit(sender: CableEndpoint, frame: EthernetFrame): void {
		this.currentlyTransmitting.push(frame);

		const receiver = sender === this.endA ? this.endB : this.endA;
		if (!receiver) {
			console.warn('No receiver connected to the cable.', this.uuid, this.endA, this.endB);
			return;
		}

		setTimeout(() => {
			this.currentlyTransmitting = this.currentlyTransmitting.filter((f) => f.uuid !== frame.uuid);
			receiver.receive(frame);
		}, 300); // Simulate transmission delay
	}
}
