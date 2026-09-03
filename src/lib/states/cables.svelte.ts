import { Cable } from '$lib/engine/Cable.svelte';
import type { CableEndpoint } from '$lib/engine/types';
import { nodes } from './nodes.svelte';
import type { Host } from '$lib/engine/Host.svelte';
import type { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';

export const cables = $state<
	{
		cableuuid: string;
		from: string; //uuid
		to: string; //uuid
		cable: Cable;
	}[]
>([]);

export const newCable = $state<{
	adding: boolean;
	uuids: string[];
}>({ adding: false, uuids: [] });

export function removeCable(cableuuid: string) {
	const cableIndex = cables.findIndex((c) => c.cableuuid === cableuuid);
	if (cableIndex !== -1) {
		const cableToRemove = cables[cableIndex].cable;
		cableToRemove.remove(); // Remove the cable from its endpoints
		cables.splice(cableIndex, 1); // Remove the cable from the state
	}
}

export function getCableEndpoint(nodeUuid: string): CableEndpoint {
	const node = nodes.find((n) => n.uuid === nodeUuid);
	if (!node) throw new Error(`Node with UUID ${nodeUuid} not found`);

	if (node.type === 'notebook' || node.type === 'desktop') {
		const host = node as Host;
		return host.dataLinkLayer;
	} else if (node.type === 'switch') {
		const switchDevice = node as SwitchWifi;
		return switchDevice.getPort();
	} else {
		throw new Error(`Unknown node type: ${node.type}`);
	}
}
