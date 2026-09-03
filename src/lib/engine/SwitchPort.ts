import type { CableEndpoint, EthernetFrame } from './types';
import type { Cable } from './Cable.svelte';
import { SwitchWifi } from './SwitchWifi.svelte';

export class SwitchPort implements CableEndpoint {
	public switch: SwitchWifi;
	public portNumber: number;
	public cable?: Cable;

	constructor(portNumber: number, switchInstance: SwitchWifi) {
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
