import type { DataLinkLayer } from './DataLinkLayer.svelte';
import type { ARPPacket, IPPacket } from './types';
import { SvelteMap } from 'svelte/reactivity';
import { HostConfig } from './NetworkConfig.svelte';

// ARP-Services für ein Gerät inkl. ARP-Cache und Warteschlange für ausstehende IP-Pakete, die auf die Auflösung warten

export class ArpService {
	private config: HostConfig;
	private dataLink: DataLinkLayer;

	public table = $state<Record<string, string>>({}); // Maps IP addresses to MAC addresses
	private pendingQueue: Map<string, IPPacket[]> = new SvelteMap(); // Maps IP addresses to queued IP packets

	constructor(config: HostConfig, dataLink: DataLinkLayer) {
		this.config = config;
		this.dataLink = dataLink;
	}

	public resolve(dstIp: string, ipPacket: IPPacket, onResolved: (mac: string) => void): void {
		const cachedMac = this.table[dstIp];
		if (cachedMac) {
			onResolved(cachedMac);
			return;
		}

		// Not in cache, send ARP request
		if (!this.pendingQueue.has(dstIp)) {
			this.pendingQueue.set(dstIp, []);
		}
		this.pendingQueue.get(dstIp)!.push(ipPacket);

		this.sendRequest(dstIp);
	}

	public handlePacket(
		arpPacket: ARPPacket,
		onPacketReadyToDeliver: (pendingPacket: IPPacket, mac: string) => void
	): void {
		// Update ARP table with the sender's MAC address
		this.table[arpPacket.senderIP] = arpPacket.senderMac;

		// answer request
		if (arpPacket.type === 'request' && arpPacket.targetIP === this.config.ipAddress) {
			const arpReply: ARPPacket = {
				type: 'reply',
				senderIP: this.config.ipAddress,
				senderMac: this.config.macAddress,
				targetIP: arpPacket.senderIP,
				targetMac: arpPacket.senderMac
			};
			this.dataLink.send(arpReply, arpPacket.senderMac, 'ARP');
		}

		// otherwise it's a reply, so we can send any queued packets
		if (arpPacket.type === 'reply' && arpPacket.targetIP === this.config.ipAddress) {
			const pendingPackets = this.pendingQueue.get(arpPacket.senderIP) || [];
			for (const pendingPacket of pendingPackets) {
				onPacketReadyToDeliver(pendingPacket, arpPacket.senderMac);
			}
			this.pendingQueue.delete(arpPacket.senderIP);
		}
	}

	private sendRequest(targetIp: string): void {
		const arpRequest: ARPPacket = {
			type: 'request',
			senderIP: this.config.ipAddress,
			senderMac: this.config.macAddress,
			targetIP: targetIp
		};
		this.dataLink.send(arpRequest, 'FF:FF:FF:FF:FF:FF', 'ARP'); // Broadcast MAC address
	}
}
