<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { Host } from '$lib/engine/Host.svelte';
	import { IPv4Pattern, isValidNetmask } from '$lib/engine/helpers';

	let n: Host | undefined = $derived(nodes.find((n) => n.uuid === editNode.uuid)) as
		Host | undefined;

	function handleNameInput(event: Event) {
		if (n) n.name = (event.currentTarget as HTMLInputElement).value;
	}
</script>

<div class="d-flex flex-row mx-4">
	<div class="d-grid inputGrid">
		<label for="name" class="col-form-label">Name</label>
		<div>
			<input value={n?.name} oninput={handleNameInput} type="text" class="form-control" id="name" />
		</div>

		<label for="mac" class=" col-form-label">MAC</label>
		<div>
			<input value={n?.config.macAddress} disabled type="text" class="form-control" id="mac" />
		</div>

		<label for="ip" class="col-form-label">IP</label>
		<div class="was-validated">
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

		<label for="netmask" class=" col-form-label">Netzmaske</label>
		<div>
			{#if n}
				<input
					bind:value={n.config.netmask}
					type="text"
					class="form-control {n?.config.netmask && !isValidNetmask(n?.config.netmask)
						? 'is-invalid'
						: 'is-valid'}"
					id="netmask"
					required
				/>
			{/if}
		</div>

		<label for="gateway" class=" col-form-label">Gateway</label>
		<div class="was-validated">
			{#if n}
				<input
					bind:value={n.config.gateway}
					type="text"
					class="form-control"
					id="gateway"
					pattern={IPv4Pattern}
				/>
			{/if}
		</div>

		<label for="dns" class=" col-form-label">Domain Name Server</label>
		<div class="was-validated">
			{#if n}
				<input
					bind:value={n.config.dns}
					type="text"
					class="form-control"
					id="dns"
					pattern={IPv4Pattern}
				/>
			{/if}
		</div>
	</div>
</div>

<style>
	.inputGrid {
		grid-template-columns: max-content 1fr;
		grid-gap: 0.5rem;
	}

	:global(.form-control:valid) {
		background-image: none !important;
	}
</style>
