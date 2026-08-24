export const cables = $state<
	{
		cableuuid: string;
		from: string;
		to: string;
	}[]
>([]);

export const newCable = $state<{
	adding: boolean;
	uuids: string[];
}>({ adding: false, uuids: [] });
