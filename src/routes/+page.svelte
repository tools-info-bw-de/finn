<script lang="ts">
	import 'bootstrap';
	import type { Edge, Node } from '@xyflow/svelte';
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import NetworkCanvas from '$lib/components/controls/NetworkCanvas.svelte';

	type HostNode = Node<{ label: string }, 'default'>;

	let nodes = $state<HostNode[]>([]);
	let edges = $state<Edge[]>([]);
	let placingNodeId = $state<string | null>(null);
	let nextHostNumber = 1;

	function addHost() {
		const id = `host-${nextHostNumber}`;
		nextHostNumber += 1;
		placingNodeId = id;
		nodes = [
			...nodes,
			{
				id,
				type: 'default',
				data: { label: `Laptop ${nextHostNumber - 1}` },
				position: { x: 0, y: 0 }
			}
		];
	}
</script>

<div class="d-flex flex-column vh-100 vw-100">
	<Navbar />

	<div class="d-flex flex-row flex-fill">
		<DeviceSelector onAddHost={addHost} />
		<NetworkCanvas />
		<!-- <Network
			bind:nodes
			bind:edges
			{placingNodeId}
			onPlacementComplete={() => (placingNodeId = null)}
		/> -->
	</div>
	<div class="h-25"></div>
</div>
