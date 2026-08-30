import { Cable } from '$lib/engine/Cable.svelte';

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
