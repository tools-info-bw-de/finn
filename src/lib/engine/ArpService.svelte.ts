import type { DataLinkLayer } from './DataLinkLayer.svelte';
import type { ARPPacket, IPPacket } from './types';
import { SvelteMap } from 'svelte/reactivity';
import { NetworkConfig } from './NetworkConfig.svelte';
import { SimulationEventBus } from './SimulationEventBus';

// ARP-Services für ein Gerät inkl. ARP-Cache und Warteschlange für ausstehende IP-Pakete, die auf die Auflösung warten

interface PendingArpEntry {
	uuid: string;
	onTimeout?: (ipPacket: IPPacket) => void;
	packets: IPPacket[];
}

export class ArpService {
	private config: NetworkConfig;
	public dataLink: DataLinkLayer;

	public table = $state<Record<string, string>>({}); // Maps IP addresses to MAC addresses
	private pendingQueue: Map<string, PendingArpEntry> = new SvelteMap(); // Maps IP addresses to ausstehende Anfragen

	constructor(config: NetworkConfig, dataLink: DataLinkLayer) {
		this.config = config;
		this.dataLink = dataLink;
	}

	public emptyTable(): void {
		this.table = {};
		this.pendingQueue = new SvelteMap();
	}

	public resolve(
		dstIp: string,
		ipPacket: IPPacket,
		onResolved: (mac: string) => void,
		onTimeout?: (ipPacket: IPPacket) => void
	): void {
		const cachedMac = this.table[dstIp];
		if (cachedMac) {
			onResolved(cachedMac);
			return;
		}

		// Not in cache
		// check if there's already a pending request for this IP
		if (this.pendingQueue.has(dstIp)) {
			this.pendingQueue.get(dstIp)!.packets.push(ipPacket);
			return;
		}

		const uuid = crypto.randomUUID();
		this.pendingQueue.set(dstIp, { uuid, onTimeout, packets: [ipPacket] });
		this.sendRequest(dstIp, uuid);
	}

	public handlePacket(
		arpPacket: ARPPacket,
		onPacketReadyToDeliver: (pendingPacket: IPPacket, mac: string) => void
	): void {
		// Update ARP table with the sender's MAC address
		this.table[arpPacket.senderIP] = arpPacket.senderMac;

		// answer request
		if (arpPacket.type === 'request') {
			const isForMe = arpPacket.targetIP === this.config.ipAddress;

			if (isForMe) {
				const arpReply: ARPPacket = {
					type: 'reply',
					senderIP: this.config.ipAddress,
					senderMac: this.config.macAddress,
					targetIP: arpPacket.senderIP,
					targetMac: arpPacket.senderMac
				};
				this.dataLink.send(arpReply, arpPacket.senderMac, 'ARP');
			}

			if (arpPacket.uuid) {
				if (isForMe) {
					// Diese Kopie führt zur Antwort: Tracking beenden, statt sie als verworfen zu zählen
					// (sonst könnte der Timeout feuern, bevor die Antwort losgeschickt wurde)
					SimulationEventBus.getInstance().clearBranch(arpPacket.uuid);
				} else {
					// Diese Anfrage-Kopie endet hier (kein Weiterleiten durch ARP-Services möglich)
					SimulationEventBus.getInstance().resolveBranch(arpPacket.uuid);
				}
			}
		}

		// otherwise it's a reply, so we can send any queued packets
		if (arpPacket.type === 'reply' && arpPacket.targetIP === this.config.ipAddress) {
			const entry = this.pendingQueue.get(arpPacket.senderIP);
			if (entry) {
				SimulationEventBus.getInstance().offExtinct(entry.uuid);
				for (const pendingPacket of entry.packets) {
					onPacketReadyToDeliver(pendingPacket, arpPacket.senderMac);
				}
				this.pendingQueue.delete(arpPacket.senderIP);
			}
		}
	}

	private sendRequest(targetIp: string, uuid: string): void {
		const arpRequest: ARPPacket = {
			type: 'request',
			senderIP: this.config.ipAddress,
			senderMac: this.config.macAddress,
			targetIP: targetIp,
			uuid
		};

		// Startet mit einer lebenden Kopie; der Switch erhöht/verringert die Zahl beim Aufsplitten
		SimulationEventBus.getInstance().registerBranch(uuid, 1);
		SimulationEventBus.getInstance().onExtinct(uuid, () => this.handleTimeout(targetIp));

		this.dataLink.send(arpRequest, 'FF:FF:FF:FF:FF:FF', 'ARP'); // Broadcast MAC address
	}

	// Wird aufgerufen, wenn alle Kopien der Anfrage verworfen wurden, ohne dass eine Antwort kam
	private handleTimeout(targetIp: string): void {
		const entry = this.pendingQueue.get(targetIp);
		if (!entry) return;
		this.pendingQueue.delete(targetIp);
		entry.packets.forEach((packet) => entry.onTimeout?.(packet));
	}
}
