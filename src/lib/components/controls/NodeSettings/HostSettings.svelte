<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { Host } from '$lib/engine/Host.svelte';
	import { IPv4Pattern } from '$lib/engine/helpers';

	let n: Host | undefined = $derived(nodes.find((n) => n.uuid === editNode.uuid)) as
		Host | undefined;

	function handleNameInput(event: Event) {
		if (n) n.name = (event.currentTarget as HTMLInputElement).value;
	}

	let shownName = $derived(n?.useIpAsName ? n!.config.ipAddress : n!.name);
</script>

<div class="d-flex flex-row justify-content-between mx-4">
	<form>
		<div class="row mb-3">
			<label for="name" class="col-sm-2 col-form-label">Name</label>
			<div class="col-sm-10">
				<input
					value={shownName}
					disabled={n?.useIpAsName}
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
			<div class="col-sm-10 was-validated">
				{#if n}
					<input
						bind:value={n.config.ipAddress}
						type="text"
						class="form-control"
						id="ip"
						pattern={IPv4Pattern}
						required
					/>
				{/if}
			</div>
		</div>
		<div class="row mb-3">
			<label for="netmask" class="col-sm-2 col-form-label">Netzmaske</label>
			<div class="col-sm-10 was-validated">
				{#if n}
					<input
						bind:value={n.config.netmask}
						type="text"
						class="form-control"
						id="netmask"
						pattern={IPv4Pattern}
						required
					/>
				{/if}
			</div>
		</div>
	</form>

	<form>
		<div class="form-check">
			<input
				class="form-check-input"
				type="checkbox"
				checked={n?.useIpAsName ?? false}
				onchange={(e) => {
					if (n) n.useIpAsName = e.currentTarget.checked;
				}}
				id="ipAsNameCheck"
			/>
			<label class="form-check-label" for="ipAsNameCheck"> IP-Adresse als Name verwenden </label>
		</div>
	</form>
</div>

<style>
	:global(.form-control:valid) {
		background-image: none !important;
	}
</style>
