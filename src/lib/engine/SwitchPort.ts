import type { ARPPacket, CableEndpoint, EthernetFrame, IPPacket } from './types';
import type { Cable } from './Cable.svelte';
import { SwitchWifi } from './SwitchWifi.svelte';
import { SimulationEventBus } from './SimulationEventBus';
import { getPacketTrackingId } from './helpers';

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
		} else if (frame.header.type === 'ARP') {
			const uuid = (frame.payload as ARPPacket).uuid;
			if (uuid) SimulationEventBus.getInstance().resolveBranch(uuid);
		} else {
			const trackingId = getPacketTrackingId(frame.payload as IPPacket);
			if (trackingId) SimulationEventBus.getInstance().emitExtinct(trackingId);
		}
	}
}
