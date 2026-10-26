import {
	cables,
	getCableEndpointByUuid,
	highlightedCable,
	newCable,
	removeCable
} from '$lib/states/cables.svelte';
import { pan, zoom } from '$lib/states/canvas.svelte';
import { hosts } from '$lib/states/hosts.svelte';
import { editNode, nodes, nodeSpawn, nodeToSniff, windows } from '$lib/states/nodes.svelte';
import { settings } from '$lib/states/settings.svelte';
import { Cable } from './Cable.svelte';
import type { DataLinkLayer } from './DataLinkLayer.svelte';
import { Host } from './Host.svelte';
import { Router } from './Router.svelte';
import { SimulationEventBus } from './SimulationEventBus';
import { SwitchWifi } from './SwitchWifi.svelte';
import type { App } from './types';

/*
{
  canvas: {
    pan: { x: number, y: number },
    zoom: number
  },
  nodes: [{
    uuid: string,
    type: 'switch' | 'router' | 'host',
    name: string,
    x: number,
    y: number,
	uuid: string,
	mac: string,
	ip: string,
	netmask: string,
	gateway: string,
  }],
  windows: WindowData[]
  }
}
*/

export function saveState(): string {
	// Knoten speichern
	const nodesStates = [];
	for (const node of nodes) {
		if (node.type === 'desktop' || node.type === 'notebook') {
			const n = node as Host;
			nodesStates.push({
				uuid: n.uuid,
				type: n.type,
				name: n.name,
				x: n.x,
				y: n.y,
				mac: n.config.macAddress,
				ip: n.config.ipAddress,
				netmask: n.config.netmask,
				gateway: n.config.gateway,
				dataLinkLayerUuid: n.dataLinkLayer.uuid,
				apps: n.apps.map((app) => ({
					type: app.type,
					content: app.content
				})),
				currentApp: n.currentApp
			});
		} else if (node.type === 'router') {
			const n = node as Router;
			nodesStates.push({
				uuid: n.uuid,
				type: n.type,
				name: n.name,
				x: n.x,
				y: n.y,
				// Speichere die UUID der DataLinkLayer für jedes Interface
				interfaces: n.interfaces.map((iface) => ({
					uuid: iface.uuid,
					dataLinkLayerUuid: iface.dataLinkLayer.uuid,
					config: {
						ipAddress: iface.networkLayer.config.ipAddress,
						netmask: iface.networkLayer.config.netmask,
						macAddress: iface.networkLayer.config.macAddress,
						gateway: iface.networkLayer.config.gateway
					}
				}))
			});
		} else if (node.type === 'switch') {
			const n = node as SwitchWifi;
			nodesStates.push({
				uuid: n.uuid,
				type: n.type,
				name: n.name,
				x: n.x,
				y: n.y
			});
		}
	}

	// Kabel speichern
	const cablesStates = [];
	for (const cable of cables) {
		let fromEndpointUuid;
		let toEndpointUuid;

		// Finde den "From"-Endpunkt des Kabels
		let n = nodes.find((n) => n.uuid === cable.from);
		if (n instanceof Host) {
			fromEndpointUuid = (n as Host).dataLinkLayer.uuid;
		} else if (n instanceof SwitchWifi) {
			fromEndpointUuid = undefined; // Switches haben keine eindeutige UUID für Ports, daher setzen wir es auf undefined
		} else if (n instanceof Router) {
			// Für Router müssen wir die Schnittstelle finden, die mit dem Kabel verbunden ist
			const router = n as Router;
			const iface = router.interfaces.find(
				(i) => i.dataLinkLayer.uuid === (cable.cable.endA! as DataLinkLayer).uuid
			);
			fromEndpointUuid = iface ? iface.dataLinkLayer.uuid : undefined;
		}
		console.log(fromEndpointUuid);

		// Finde den "To"-Endpunkt des Kabels
		n = nodes.find((n) => n.uuid === cable.to);
		if (n instanceof Host) {
			toEndpointUuid = (n as Host).dataLinkLayer.uuid;
		} else if (n instanceof SwitchWifi) {
			toEndpointUuid = undefined; // Switches haben keine eindeutige UUID für Ports, daher setzen wir es auf undefined
		} else if (n instanceof Router) {
			// Für Router müssen wir die Schnittstelle finden, die mit dem Kabel verbunden ist
			const router = n as Router;
			const iface = router.interfaces.find(
				(i) => i.dataLinkLayer.uuid === (cable.cable.endB! as DataLinkLayer).uuid
			)!;
			toEndpointUuid = iface.dataLinkLayer.uuid;
		}

		cablesStates.push({
			cableuuid: cable.cableuuid,
			fromNodeUuid: cable.from,
			fromEndpointUuid: fromEndpointUuid,
			toNodeUuid: cable.to,
			toEndpointUuid: toEndpointUuid
		});
	}

	const state = {
		canvas: {
			pan: { x: pan.x, y: pan.y },
			zoom: zoom.value
		},
		nodes: nodesStates,
		nodeSpawn: { x: nodeSpawn.x, y: nodeSpawn.y },
		cables: cablesStates
	};

	return JSON.stringify(state);
}

/**
 * Lädt den Zustand des Netzwerks aus einem JSON-String. Vor dem Laden wird der aktuelle Zustand zurückgesetzt.
 * @param stateString Inhalt aus der JSON-Datei
 */
export function loadState(stateString: string): void {
	// Alles erst mal löschen & zurücksetzen, bevor der neue Zustand geladen wird
	resetProject();

	settings.mode = 'edit';

	try {
		const state = JSON.parse(stateString);

		// Canvas
		pan.x = state.canvas.pan.x;
		pan.y = state.canvas.pan.y;
		zoom.value = state.canvas.zoom;
		nodeSpawn.x = state.nodeSpawn.x;
		nodeSpawn.y = state.nodeSpawn.y;

		// Nodes
		for (const nodeData of state.nodes) {
			let node;
			if (nodeData.type === 'desktop' || nodeData.type === 'notebook') {
				node = new Host(
					nodeData.name,
					nodeData.mac,
					nodeData.ip,
					nodeData.netmask,
					nodeData.type,
					nodeData.gateway,
					nodeData.dataLinkLayerUuid
				);
				node.apps = nodeData.apps.map((appData: App) => ({
					type: appData.type,
					content: appData.content
				}));
				node.currentApp = nodeData.currentApp;
			} else if (nodeData.type === 'router') {
				node = new Router(nodeData.name, nodeData.interfaces.length);
				//let ifaceIndex = 0;
				for (const ifaceData of nodeData.interfaces) {
					// Nutze das 1. oder 2. Default-Interface, ansonsten erstelle ein neues
					node.addInterfaceFromFile(
						ifaceData.uuid,
						ifaceData.dataLinkLayerUuid,
						ifaceData.config.ipAddress,
						ifaceData.config.netmask,
						ifaceData.config.macAddress,
						ifaceData.config.gateway
					);
				}
			} else if (nodeData.type === 'switch') {
				node = new SwitchWifi(nodeData.name);
			} else {
				throw new Error(`Unknown node type: ${nodeData.type}`);
			}
			node.x = nodeData.x;
			node.y = nodeData.y;
			node.uuid = nodeData.uuid; // Setze die UUID auf den gespeicherten Wert
			nodes.push(node);
		}

		// Cables
		for (const cableData of state.cables) {
			const c = new Cable(
				getCableEndpointByUuid(cableData.fromNodeUuid, cableData.fromEndpointUuid)!,
				getCableEndpointByUuid(cableData.toNodeUuid, cableData.toEndpointUuid)!
			);
			c.uuid = cableData.cableuuid; // Setze die UUID auf den gespeicherten Wert
			cables.push({
				cableuuid: c.uuid,
				from: cableData.fromNodeUuid,
				to: cableData.toNodeUuid,
				cable: c
			});

			/*const fromNode = nodes.find((n) => n.uuid === cableData.fromNodeUuid);
			const toNode = nodes.find((n) => n.uuid === cableData.toNodeUuid);

			if (!fromNode || !toNode) {
				console.warn(`Could not find nodes for cable ${cableData.cableuuid}`);
				continue;
			}

			let fromEndpoint: DataLinkLayer | undefined;
			let toEndpoint: DataLinkLayer | undefined;
			
			if (fromNode instanceof Host) {
				fromEndpoint = fromNode.dataLinkLayer;
			} else if (fromNode instanceof Router) {
				fromEndpoint = fromNode.interfaces.find(
					(i) => i.dataLinkLayer.uuid === cableData.fromEndpointUuid
				)?.dataLinkLayer;
			}

			if (toNode instanceof Host) {
				toEndpoint = toNode.dataLinkLayer;
			} else if (toNode instanceof Router) {
				toEndpoint = toNode.interfaces.find(
					(i) => i.dataLinkLayer.uuid === cableData.toEndpointUuid
				)?.dataLinkLayer;
			}

			if (!fromEndpoint || !toEndpoint) {
				console.warn(`Could not find endpoints for cable ${cableData.cableuuid}`);
				continue;
			}

			const cable = new Cable(fromEndpoint, toEndpoint);
			cable.cableuuid = cableData.cableuuid; // Setze die UUID auf den gespeicherten Wert
			cables.push({
				cableuuid: cable.cableuuid,
				from: fromNode.uuid,
				to: toNode.uuid,
				cable: cable
			});*/
		}
	} catch (error) {
		// TODO Fehlermeldung anzeigen
		console.error('Error parsing JSON:', error);
	}
}

export function resetProject() {
	for (const { cableuuid } of [...cables]) {
		removeCable(cableuuid);
	}

	nodes.splice(0);
	windows.splice(0);
	hosts.splice(0);

	pan.x = 0;
	pan.y = 0;
	zoom.value = 1;

	editNode.uuid = '';
	nodeToSniff.nodeUuid = '';
	nodeToSniff.dataLinkLayerUuid = '';
	nodeSpawn.x = 0;
	nodeSpawn.y = 0;

	highlightedCable.uuid = '';
	newCable.adding = false;
	newCable.uuids = [];

	SimulationEventBus.getInstance().clear();
}
