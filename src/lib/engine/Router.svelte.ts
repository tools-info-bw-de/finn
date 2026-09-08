import type { ICMPPacket, IPPacket } from './types';
import { ArpService } from './ArpService.svelte';
import { NetworkLayer } from './NetworkLayer';
import type { LayerInterface } from './types';
import { NetworkConfig } from './NetworkConfig.svelte';
import type { NetworkNode } from './types';
import { DataLinkLayer } from './DataLinkLayer.svelte';
import { generateRandomMac } from './helpers';

export interface RouterInterface {
	arpService: ArpService;
	networkLayer: NetworkLayer;
	lowerLayer?: LayerInterface;
}

export interface RouteEntry {
	subnet: string;
	netmask: string;
	nextHop: string | null;
	iface: RouterInterface;
}

export class Router implements NetworkNode {
	public uuid: string;
	public name = $state<string>('');
	public x = $state<number>(0);
	public y = $state<number>(0);
	public type: 'router';

	public interfaces = $state<RouterInterface[]>([]);
	public routingTable = $state<RouteEntry[]>([]);

	constructor(name: string) {
		this.uuid = crypto.randomUUID();
		this.name = name;
		this.type = 'router';

		const networkConfig1: NetworkConfig = new NetworkConfig(
			generateRandomMac(),
			'192.168.0.10',
			'255.255.255.0'
		);
		const dataLinkLayer1: DataLinkLayer = new DataLinkLayer(networkConfig1);
		const arpService1: ArpService = new ArpService(networkConfig1, dataLinkLayer1);
		this.addInterface(networkConfig1, arpService1, dataLinkLayer1);

		const networkConfig2: NetworkConfig = new NetworkConfig(
			generateRandomMac(),
			'192.168.0.10',
			'255.255.255.0'
		);
		const dataLinkLayer2: DataLinkLayer = new DataLinkLayer(networkConfig2);
		const arpService2: ArpService = new ArpService(networkConfig2, dataLinkLayer2);
		this.addInterface(networkConfig2, arpService2, dataLinkLayer2);
	}

	/**
	 * Fügt ein Interface zur Liste hinzu
	 */
	public addInterface(
		config: NetworkConfig,
		arpService: ArpService,
		lowerLayer?: LayerInterface
	): RouterInterface {
		const networkLayer = new NetworkLayer(config, arpService, true);

		if (lowerLayer) {
			networkLayer.lowerLayer = lowerLayer;
		}

		const iface: RouterInterface = {
			arpService,
			networkLayer,
			lowerLayer
		};

		this.interfaces.push(iface);

		// Automatische Subnetz-Route eintragen
		this.updateConnectedRoute(iface);

		// Paket-Empfang an dieses Interface koppeln
		this.attachPacketListener(iface);

		return iface;
	}

	/**
	 * Trägt die direkt verbundene Route für ein Interface ein
	 * (kann auch aufgerufen werden, wenn sich die IP des Interfaces ändert!)
	 */
	public updateConnectedRoute(iface: RouterInterface): void {
		// Alte direkt verbundene Route für dieses Interface entfernen (falls IP geändert wurde)
		this.routingTable = this.routingTable.filter((r) => !(r.iface === iface && r.nextHop === null));

		const subnet = this.getSubnetAddress(
			iface.networkLayer.config.ipAddress,
			iface.networkLayer.config.netmask
		);

		this.addRoute({
			subnet,
			netmask: iface.networkLayer.config.netmask,
			nextHop: null,
			iface // Direkt das Interface-Objekt übergeben
		});
	}

	public addRoute(route: RouteEntry): void {
		this.routingTable.push(route);
		// Sortierung nach Präfixlänge (Longest Prefix Match)
		this.routingTable.sort((a, b) => this.ipToInt(b.netmask) - this.ipToInt(a.netmask));
	}

	private attachPacketListener(iface: RouterInterface): void {
		const originalReceive = iface.networkLayer.receive.bind(iface.networkLayer);

		iface.networkLayer.receive = (packet, type) => {
			if (type === 'ARP') {
				originalReceive(packet, type);
				return;
			}

			const ipPacket = packet as IPPacket;

			// Prüfen, ob die Ziel-IP einer der IPs unserer Interfaces entspricht
			const isForAnyInterface = this.interfaces.some(
				(i) => i.networkLayer.config.ipAddress === ipPacket.header.dstIp
			);

			if (isForAnyInterface || ipPacket.header.dstIp === '255.255.255.255') {
				originalReceive(packet, type);
			} else {
				this.routePacket(ipPacket, iface);
			}
		};
	}

	public routePacket(ipPacket: IPPacket, ingressIface: RouterInterface): void {
		// 1. TTL prüfen
		ipPacket.header.ttl--;
		if (ipPacket.header.ttl <= 0) {
			this.sendIcmpError(ipPacket, ingressIface, 'time-exceeded');
			return;
		}

		// 2. Ziel-Route suchen
		const route = this.findBestRoute(ipPacket.header.dstIp);
		if (!route) {
			this.sendIcmpError(ipPacket, ingressIface, 'destination-unreachable');
			return;
		}

		const egressIface = route.iface;
		if (!egressIface.lowerLayer) {
			return;
		}

		// 3. Next-Hop ermitteln
		const nextHopIp = route.nextHop ?? ipPacket.header.dstIp;

		// 4. Über das gefundene Ausgangs-Interface auflösen & senden
		egressIface.arpService.resolve(nextHopIp, ipPacket, (macAddress) => {
			egressIface.lowerLayer?.send(ipPacket, macAddress, 'IP');
		});
	}

	private sendIcmpError(
		failedPacket: IPPacket,
		ingressIface: RouterInterface,
		type: 'time-exceeded' | 'destination-unreachable'
	): void {
		if (failedPacket.header.protocol === 'ICMP') {
			const icmp = failedPacket.payload as ICMPPacket;
			if (icmp.type === 'time-exceeded' || icmp.type === 'destination-unreachable') return;
		}

		const errorIcmpPacket: ICMPPacket = {
			type,
			originalPacket: failedPacket
		};

		// Über das Eingangs-Interface direkt an Quell-IP zurücksenden
		ingressIface.networkLayer.send(errorIcmpPacket, failedPacket.header.srcIp, 'ICMP');
	}

	private findBestRoute(dstIp: string): RouteEntry | null {
		const dstInt = this.ipToInt(dstIp);

		for (const route of this.routingTable) {
			const maskInt = this.ipToInt(route.netmask);
			const subnetInt = this.ipToInt(route.subnet);

			if ((dstInt & maskInt) >>> 0 === subnetInt) {
				return route;
			}
		}
		return null;
	}

	private ipToInt(ip: string): number {
		return ip.split('.').reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0);
	}

	private getSubnetAddress(ip: string, mask: string): string {
		const netInt = (this.ipToInt(ip) & this.ipToInt(mask)) >>> 0;
		return [(netInt >>> 24) & 255, (netInt >>> 16) & 255, (netInt >>> 8) & 255, netInt & 255].join(
			'.'
		);
	}
}
