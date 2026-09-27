import { nodes } from '$lib/states/nodes.svelte';
import { DataLinkLayer } from './DataLinkLayer.svelte';
import { isSameSubnet } from './helpers';
import { Host } from './Host.svelte';
import { Router } from './Router.svelte';
import { SvelteSet } from 'svelte/reactivity';
import { SwitchPort } from './SwitchPort';

export function calculateRTTHops(startIP: string, targetIP: string): number {
	const forwardHops = tracePath(startIP, targetIP);
	const returnHops = tracePath(targetIP, startIP);

	return forwardHops + returnHops;
}

export function tracePath(startIP: string, targetIP: string): number {
	let currentNode = nodes.find((n) => {
		if (n instanceof Host) {
			return (n as Host).config.ipAddress === startIP;
		} else if (n instanceof Router) {
			return (n as Router).interfaces.some((iface) => iface.config.ipAddress === startIP);
		}
		return false;
	});

	if (currentNode === undefined) {
		console.warn(`[tracePath] Kein Startknoten für die IP ${startIP} gefunden.`);
		return 0;
	}

	let totalHops = -1;
	let ttl = 64;
	const visitedNodes = new SvelteSet<string>();
	let currentTargetIP = targetIP;

	while (ttl > 0) {
		if (visitedNodes.has(currentNode.uuid)) {
			console.warn(`[tracePath] Schleife erkannt bei der IP ${startIP}.`);
			return 0;
		}
		visitedNodes.add(currentNode.uuid);

		if (currentNode instanceof Host) {
			const n = currentNode as Host;
			ttl--;

			//ziel gefunden?
			if (n.config.ipAddress === targetIP) {
				return totalHops;
			}

			//gleiches subnet?
			if (isSameSubnet(n.config.ipAddress, currentTargetIP, n.config.netmask)) {
				//direkt erreichbar
				const nextEndpoint = n.dataLinkLayer.cable?.getOtherEndpoint(n.dataLinkLayer);
				if (nextEndpoint instanceof DataLinkLayer) {
					currentNode = nodes.find((node) => {
						if (node instanceof Host) {
							return (node as Host).dataLinkLayer === nextEndpoint;
						} else if (node instanceof Router) {
							return (node as Router).interfaces.some(
								(iface) => iface.dataLinkLayer === nextEndpoint
							);
						}
						return false;
					});
				} else if (nextEndpoint instanceof SwitchPort) {
					currentNode = nodes.find((node) => {
						if (node instanceof Host) {
							return (node as Host).dataLinkLayer === nextEndpoint;
						} else if (node instanceof Router) {
							return (node as Router).interfaces.some(
								(iface) => iface.dataLinkLayer === nextEndpoint
							);
						}
						return false;
					});
				}
			}
		}

		totalHops++;
	}

	return totalHops;
}
