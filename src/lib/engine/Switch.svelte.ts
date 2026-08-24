import { SwitchPort } from './SwitchPort';
import type { EthernetFrame, NetworkNode } from './types';

export interface MacTableEntry {
	mac: string;
	port: number;
	updatedAt: number; // Timestamp of the last update
}

export class Switch implements NetworkNode {
	public uuid: string = crypto.randomUUID();
	public type: 'switch';
	public name = $state<string>('');
	private portCounter: number = 0; // Counter to assign unique port numbers
	public x = $state<number>(0);
	public y = $state<number>(0);

	public ports = $state<SwitchPort[]>([]);
	public macTable = $state<Record<string, MacTableEntry>>({}); // Maps MAC addresses to MacTableEntry

	constructor(name: string) {
		this.name = name;
		this.type = 'switch';
		this.x = 0;
		this.y = 0;
	}

	// Method to add a port to the switch
	public getPort(): SwitchPort {
		const port = new SwitchPort(this.portCounter++, this);
		this.ports.push(port);
		return port;
	}

	public receive(portNumber: number, frame: EthernetFrame): void {
		// Update MAC table with the source MAC address
		this.macTable[frame.header.srcMac] = {
			mac: frame.header.srcMac,
			port: portNumber,
			updatedAt: Date.now()
		};

		// Forward
		const isBroadcast = frame.header.dstMac === 'FF:FF:FF:FF:FF:FF';
		const destinationEntry = this.macTable[frame.header.dstMac];

		if (isBroadcast || !destinationEntry) {
			// Broadcast or unknown destination: send to all ports except the source port
			this.ports.forEach((port) => {
				if (port.portNumber !== portNumber) {
					port.send(frame);
				}
			});
		} else {
			// Known destination: send only to the specific port

			if (destinationEntry.port === portNumber) {
				// The frame is coming from the same port as the destination, so we don't forward it.
				return;
			}

			const destinationPort = this.ports.find((p) => p.portNumber === destinationEntry.port);
			if (destinationPort) {
				destinationPort.send(frame);
			}
		}
	}
}
