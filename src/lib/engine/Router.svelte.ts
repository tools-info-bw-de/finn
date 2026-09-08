import type { ICMPPacket, IPPacket } from './types';
import type { NetworkNode } from './types';
import { ipToInt } from './helpers';
import { RouterInterface } from './RouterInterface.svelte';

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

		this.addInterface();
		this.addInterface();
	}

	/**
	 * Fügt ein Interface zur Liste hinzu
	 */
	public addInterface(): RouterInterface {
		const iface = new RouterInterface();

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
		this.routingTable.sort((a, b) => ipToInt(b.netmask) - ipToInt(a.netmask));
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
		console.log('routePacket', ipPacket);

		// 1. TTL prüfen
		ipPacket.header.ttl--;
		if (ipPacket.header.ttl <= 0) {
			this.sendIcmpError(ipPacket, ingressIface, 'time-exceeded');
			return;
		}

		// 2. Ziel-Route suchen
		const route = this.findBestRoute(ipPacket.header.dstIp);
		console.log(route);
		if (!route) {
			this.sendIcmpError(ipPacket, ingressIface, 'destination-unreachable');
			return;
		}

		const egressIface = route.iface;

		// 3. Next-Hop ermitteln
		const nextHopIp = route.nextHop ?? ipPacket.header.dstIp;

		// 4. Über das gefundene Ausgangs-Interface auflösen & senden
		egressIface.arpService.resolve(nextHopIp, ipPacket, (macAddress) => {
			egressIface.dataLinkLayer.send(ipPacket, macAddress, 'IP');
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
		const dstInt = ipToInt(dstIp);

		for (const route of this.routingTable) {
			const maskInt = ipToInt(route.netmask);
			const subnetInt = ipToInt(route.subnet);

			if ((dstInt & maskInt) >>> 0 === subnetInt) {
				return route;
			}
		}
		return null;
	}

	private getSubnetAddress(ip: string, mask: string): string {
		const netInt = (ipToInt(ip) & ipToInt(mask)) >>> 0;
		return [(netInt >>> 24) & 255, (netInt >>> 16) & 255, (netInt >>> 8) & 255, netInt & 255].join(
			'.'
		);
	}
}
