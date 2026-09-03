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
		let device = null;
		for (const n of nodes) {
			if (n.type === 'notebook' || n.type === 'desktop') {
				if ((n as Host).config.ipAddress === '192.168.0.10') {
					device = n as Host;
					break;
				}
			}
		}
		if (device) {
			device.icmp.sendPing('192.168.0.11');
		} else {
			console.log('No device with IP 10 found');
		}
	}

	let shownName = $derived(n?.config.useIpAsName ? n!.config.ipAddress : n!.name);
</script>

<div class="d-flex flex-row justify-content-between mx-4">
	<form>
		<div class="row mb-3">
			<label for="name" class="col-sm-2 col-form-label">Name</label>
			<div class="col-sm-10">
				<input
					value={shownName}
					disabled={n?.config.useIpAsName}
					oninput={handleNameInput}
					type="text"
					class="form-control"
					id="name"
				/>
			</div>
		</div>
		<div class="row mb-3">
			<label for="mac" class="col-sm-2 col-form-label">MAC</label>
			<div class="col-sm-10">
				<input value={n?.config.macAddress} disabled type="text" class="form-control" id="mac" />
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

	<form>
		<div class="form-check">
			<input
				class="form-check-input"
				type="checkbox"
				checked={n?.config.useIpAsName ?? false}
				onchange={(e) => {
					if (n) n.config.useIpAsName = e.currentTarget.checked;
				}}
				id="ipAsNameCheck"
			/>
			<label class="form-check-label" for="ipAsNameCheck"> IP-Adresse als Name verwenden </label>
		</div>
	</form>
</div>
