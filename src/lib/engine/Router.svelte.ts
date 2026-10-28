import type { ICMPPacket, IPPacket, TCPSegment, UDPDatagram } from './types';
import type { NetworkNode } from './types';
import { getPacketTrackingId, ipToInt } from './helpers';
import { RouterInterface } from './RouterInterface.svelte';
import { SimulationEventBus } from './SimulationEventBus';
import { nodeSpawn } from '$lib/states/nodes.svelte';

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

	/**
	 * Erzeugt einen neuen Router mit dem angegebenen Namen. Optionaler Parameter gibt an, wie viele Interfaces aus Datei geladen werden (sofern vorhanden).
	 * @param name
	 * @param loadInterfaces Gibt an, wie viele Interfaces aus der Datei geladen werden (falls es eine gibt). Entsprechend weniger Interfaces vom Default 2 werden erzeugt.
	 */
	constructor(name: string, loadInterfaces: number = 0) {
		this.uuid = crypto.randomUUID();
		this.name = name;
		this.type = 'router';
		this.x = nodeSpawn.x;
		this.y = nodeSpawn.y;

		// Der Parameter loadInterfaces gibt an, wie viele Interfaces aus der Datei geladen werden sollen.
		// Wenn er 0 ist, werden 2 leere Default-Interfaces erzeugt (Standard).
		// Wenn er 1 ist, wird 1 Default-Interface erzeugt (das andere wird aus der Datei direkt mit Werten bestückt).
		// Wenn er größer als 1 ist, werden keine Interfaces erzeugt (da sie aus der Datei geladen werden und direkt mit Werten bestückt werden).
		if (loadInterfaces == 1) {
			this.addInterface();
		} else if (loadInterfaces == 0) {
			this.addInterface();
			this.addInterface();
		}
	}

	public addInterfaceFromFile(
		uuid: string,
		dataLinkLayerUuid: string,
		ipAddress: string,
		netmask: string,
		macAddress: string,
		gateway: string
	): RouterInterface {
		const iface = new RouterInterface(
			uuid,
			dataLinkLayerUuid,
			macAddress,
			ipAddress,
			netmask,
			gateway
		);

		this.interfaces.push(iface);

		// Automatische Subnetz-Route eintragen
		this.updateConnectedRoute(iface);

		// Paket-Empfang an dieses Interface koppeln
		this.attachPacketListener(iface);

		return iface;
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

		// 3. Next-Hop ermitteln
		const nextHopIp = route.nextHop ?? ipPacket.header.dstIp;

		// 4. Über das gefundene Ausgangs-Interface auflösen & senden
		egressIface.arpService.resolve(
			nextHopIp,
			ipPacket,
			(macAddress) => {
				egressIface.dataLinkLayer.send(ipPacket, macAddress, 'IP');
			},
			(failedPacket) => {
				// ARP-Auflösung lief ins Leere -> Pseudo-Timeout direkt melden (kein echtes Paket zurückschicken)
				const timeoutUuid = getPacketTrackingId(failedPacket);
				if (timeoutUuid) {
					SimulationEventBus.getInstance().emitExtinct(timeoutUuid);
				}
			}
		);
	}

	private sendIcmpError(
		failedPacket: IPPacket,
		ingressIface: RouterInterface,
		type: 'time-exceeded' | 'destination-unreachable'
	): void {
		if (failedPacket.header.protocol === 'ICMP') {
			const icmp = failedPacket.payload as ICMPPacket;
			if (icmp.type === 'time-exceeded' || icmp.type === 'destination-unreachable') {
				SimulationEventBus.getInstance().emitExtinct(icmp.timeoutUuid);
				return;
			}
		}

		const protocol = failedPacket.header.protocol;
		let original: ICMPPacket['original'];
		if (protocol === 'ICMP') {
			original = { protocol, seq: (failedPacket.payload as ICMPPacket).seq };
		} else if (protocol === 'TCP') {
			const { srcPort, dstPort } = (failedPacket.payload as TCPSegment).header;
			original = { protocol, srcPort, dstPort };
		} else {
			const { srcPort, dstPort } = (failedPacket.payload as UDPDatagram).header;
			original = { protocol, srcPort, dstPort };
		}

		const errorIcmpPacket: ICMPPacket = {
			type,
			timeoutUuid: getPacketTrackingId(failedPacket) ?? '',
			original
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
