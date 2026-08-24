<script lang="ts">
	import 'bootstrap';
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import NetworkCanvas from '$lib/components/controls/NetworkCanvas.svelte';
	/* import type { NetworkNode } from '$lib/engine/types'; */
	//import type { Cable } from '$lib/engine/Cable.svelte';
	import { Host } from '$lib/engine/Host.svelte';
	import { Switch } from '$lib/engine/Switch.svelte';
	import { generateRandomMac } from '$lib/engine/helpers';
	import { nodes } from '$lib/states/nodes.svelte';

	/* let nodes = $state<NetworkNode[]>([]); */
	//let edges = $state<Cable[]>([]);

	function createNode(type: 'notebook' | 'desktop' | 'switch') {
		console.log(type);
		if (type === 'notebook') {
			let host: Host = new Host(`Notebook`, generateRandomMac(), '192.168.0.10', 'notebook');
			nodes.push(host);
		} else if (type === 'desktop') {
			let host: Host = new Host(`Rechner`, generateRandomMac(), '192.168.0.10', 'desktop');
			nodes.push(host);
		} else if (type === 'switch') {
			let switchDevice: Switch = new Switch('Switch');
			nodes.push(switchDevice);
		}
	}

	$effect(() => {
		console.log('Nodes:', nodes);
	});
</script>

<div class="d-flex flex-column vh-100 vw-100">
	<Navbar />

	<div class="d-flex flex-row flex-fill">
		<DeviceSelector {createNode} />
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
