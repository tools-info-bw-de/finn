<script lang="ts">
	import cable from '$lib/assets/cable.png';
	import laptop from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';
	import { Host } from '$lib/engine/Host.svelte';
	import { Switch } from '$lib/engine/Switch.svelte';
	import { generateRandomMac } from '$lib/engine/helpers';
	import { nodes } from '$lib/states/nodes.svelte';
	import { cables, newCable } from '$lib/states/cables.svelte';

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

	function startAddingCable() {
		newCable.adding = true;
		newCable.uuids = [];
	}

	$effect(() => {
		if (newCable.adding && newCable.uuids.length === 2) {
			cables.push({
				cableuuid: crypto.randomUUID(),
				from: newCable.uuids[0],
				to: newCable.uuids[1]
			});
			newCable.adding = false;
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
