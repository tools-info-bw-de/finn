<script lang="ts">
	import cable from '$lib/assets/cable.png';
	import laptop from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';
	import { Host } from '$lib/engine/Host.svelte';
	import { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';
	import { generateRandomMac } from '$lib/engine/helpers';
	import { nodes } from '$lib/states/nodes.svelte';
	import { cables, newCable, getCableEndpoint } from '$lib/states/cables.svelte';
	import { Cable } from '$lib/engine/Cable.svelte';

	function createNode(type: 'notebook' | 'desktop' | 'switch') {
		console.log(type);
		if (type === 'notebook') {
			let host: Host = new Host(`Notebook`, generateRandomMac(), '192.168.0.10', 'notebook');
			nodes.push(host);
		} else if (type === 'desktop') {
			let host: Host = new Host(`Rechner`, generateRandomMac(), '192.168.0.10', 'desktop');
			nodes.push(host);
		} else if (type === 'switch') {
			let switchDevice: SwitchWifi = new SwitchWifi('Switch');
			nodes.push(switchDevice);
		}
	}

	function startAddingCable() {
		newCable.adding = true;
		newCable.uuids = [];
	}

	$effect(() => {
		if (newCable.adding && newCable.uuids.length === 2) {
			const c = new Cable(getCableEndpoint(newCable.uuids[0]), getCableEndpoint(newCable.uuids[1]));
			cables.push({
				cableuuid: c.uuid,
				from: newCable.uuids[0],
				to: newCable.uuids[1],
				cable: c
			});
			newCable.uuids = [];
		}
	});
</script>

<div class="d-flex flex-column">
	<button type="button" class="btn btn-primary" onclick={startAddingCable}>
		<img src={cable} alt="Cable" width="32" height="32" />
	</button>
	<button type="button" class="btn btn-primary" onclick={() => createNode('notebook')}>
		<img src={laptop} alt="Laptop" width="32" height="32" />
	</button>
	<button type="button" class="btn btn-primary" onclick={() => createNode('desktop')}>
		<img src={desktop} alt="Desktop" width="32" height="32" />
	</button>
	<button type="button" class="btn btn-primary" onclick={() => createNode('switch')}>
		<img src={switch_wifi} alt="Switch" width="32" height="32" />
	</button>
</div>
