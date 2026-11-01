<script lang="ts">
	import cable from '$lib/assets/cable.png';
	import laptop from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';
	import router from '$lib/assets/router.png';
	import { Host } from '$lib/engine/Host.svelte';
	import { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';
	import { generateRandomMac } from '$lib/engine/helpers';
	import { nodes } from '$lib/states/nodes.svelte';
	import { Router } from '$lib/engine/Router.svelte';
	import { cables, getCableEndpoint, newCable } from '$lib/states/cables.svelte';
	import { Cable } from '$lib/engine/Cable.svelte';

	function createNode(type: 'notebook' | 'desktop' | 'switch' | 'router') {
		if (type === 'notebook') {
			let host: Host = new Host(
				`Notebook`,
				generateRandomMac(),
				'192.168.0.10',
				'255.255.255.0',
				'notebook'
			);
			nodes.push(host);
		} else if (type === 'desktop') {
			let host: Host = new Host(
				`Rechner`,
				generateRandomMac(),
				'192.168.0.10',
				'255.255.255.0',
				'desktop'
			);
			nodes.push(host);
		} else if (type === 'switch') {
			let switchDevice: SwitchWifi = new SwitchWifi('Switch');
			nodes.push(switchDevice);
		} else if (type === 'router') {
			let routerDevice: Router = new Router('Router');
			nodes.push(routerDevice);
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

<div class="device-selector d-flex flex-column gap-2 px-2 pt-3">
	<button type="button" class="btn btn-secondary" onclick={startAddingCable}>
		<img src={cable} alt="Cable" />
		Kabel
	</button>
	<button type="button" class="btn btn-secondary" onclick={() => createNode('notebook')}>
		<img src={laptop} alt="Laptop" />
		Notebook
	</button>
	<button type="button" class="btn btn-secondary" onclick={() => createNode('desktop')}>
		<img src={desktop} alt="Desktop" />
		Rechner
	</button>
	<button type="button" class="btn btn-secondary" onclick={() => createNode('switch')}>
		<img src={switch_wifi} alt="Switch" />
		Switch
	</button>
	<button type="button" class="btn btn-secondary" onclick={() => createNode('router')}>
		<img src={router} alt="Router" />
		Router
	</button>
</div>

<style scoped>
	button {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	img {
		width: 48px;
		height: 48px;
	}

	.device-selector {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		z-index: 1000;
		background-color: var(--bs-body-bg);
	}
</style>
