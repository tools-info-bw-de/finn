import type { CableEndpoint, EthernetFrame } from './types';
import type { Cable } from './Cable.svelte';
import { Switch } from './Switch.svelte';

export class SwitchPort implements CableEndpoint {
	public switch: Switch;
	public portNumber: number;
	public cable?: Cable;

	constructor(portNumber: number, switchInstance: Switch) {
		this.portNumber = portNumber;
		this.switch = switchInstance;
	}

	public receive(frame: EthernetFrame): void {
		this.switch.receive(this.portNumber, frame);
	}

	public send(frame: EthernetFrame): void {
		if (this.cable) {
			this.cable.transmit(this, frame);
		}
	}
}
