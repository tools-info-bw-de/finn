import type { DataLinkLayer } from './DataLinkLayer.svelte';
import type { EthernetFrame } from './types';

export class Cable {
	public uuid: string;
	private endA?: DataLinkLayer;
	private endB?: DataLinkLayer;

	private currentlyTransmitting: EthernetFrame[] = [];
	public isTransmitting = $derived(this.currentlyTransmitting.length > 0);

	constructor(uuid: string) {
		this.uuid = uuid;
	}

	public connect(a: DataLinkLayer, b: DataLinkLayer): void {
		this.endA = a;
		this.endB = b;
		a.cable = this;
		b.cable = this;
	}

	public transmit(sender: DataLinkLayer, frame: EthernetFrame): void {
		this.currentlyTransmitting.push(frame);

		const receiver = sender === this.endA ? this.endB : this.endA;
		if (!receiver) {
			console.warn('No receiver connected to the cable.', this.uuid, this.endA, this.endB);
			return;
		}

		setTimeout(() => {
			this.currentlyTransmitting = this.currentlyTransmitting.filter((f) => f.uuid !== frame.uuid);
			receiver.receive(frame);
		}, 1000); // Simulate transmission delay
	}
}
