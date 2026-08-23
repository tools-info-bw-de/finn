import type { CableEndpoint, EthernetFrame } from './types';

export class Cable {
	public uuid: string;
	private endA?: CableEndpoint;
	private endB?: CableEndpoint;

	private currentlyTransmitting: EthernetFrame[] = [];
	public isTransmitting = $derived(this.currentlyTransmitting.length > 0);

	constructor() {
		this.uuid = crypto.randomUUID();
	}

	public connect(a: CableEndpoint, b: CableEndpoint): void {
		this.endA = a;
		this.endB = b;
		a.cable = this;
		b.cable = this;
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
