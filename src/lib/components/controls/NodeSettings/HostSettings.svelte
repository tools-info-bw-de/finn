<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { Host } from '$lib/engine/Host.svelte';

	let n: Host | undefined = $derived(nodes.find((n) => n.uuid === editNode.uuid)) as
		Host | undefined;

	function handleNameInput(event: Event) {
		if (n) n.name = (event.currentTarget as HTMLInputElement).value;
	}

	function handleIpInput(event: Event) {
		if (n) n.config.ipAddress = (event.currentTarget as HTMLInputElement).value;
	}

	function sendTestPing() {
		// get device with ip 10 as Host
		const device = nodes.find((n) => (n as Host).config.ipAddress === '192.168.0.10') as
			Host | undefined;
		if (device) {
			device.icmp.sendPing('192.168.0.11');
		} else {
			console.log('No device with IP 10 found');
		}
	}
</script>

<form>
	<div class="row mb-3">
		<label for="name" class="col-sm-2 col-form-label">Name</label>
		<div class="col-sm-10">
			<input value={n?.name} oninput={handleNameInput} type="text" class="form-control" id="name" />
		</div>
	</div>
	<div class="row mb-3">
		<label for="ip" class="col-sm-2 col-form-label">IP</label>
		<div class="col-sm-10">
			<input
				value={n?.config.ipAddress}
				oninput={handleIpInput}
				type="text"
				class="form-control"
				id="ip"
			/>
		</div>
	</div>
	<button type="button" onclick={sendTestPing}>Save</button>
</form>
