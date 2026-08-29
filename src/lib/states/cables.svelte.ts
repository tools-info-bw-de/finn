export const cables = $state<
	{
		cableuuid: string;
		from: string; //uuid
		to: string; //uuid
	}[]
>([]);

export const newCable = $state<{
	adding: boolean;
	uuids: string[];
}>({ adding: false, uuids: [] });
