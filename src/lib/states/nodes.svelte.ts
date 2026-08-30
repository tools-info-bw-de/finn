import type { NetworkNode } from '$lib/engine/types';

export const nodes = $state<NetworkNode[]>([]);

export const editNode = $state<{ uuid: string }>({ uuid: '' });
