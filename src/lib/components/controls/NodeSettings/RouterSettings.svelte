<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { Router } from '$lib/engine/Router.svelte';
	import { RouterInterface } from '$lib/engine/RouterInterface.svelte';
	import { highlightedCable } from '$lib/states/cables.svelte';
	import { onDestroy } from 'svelte';
	import { IPv4Pattern, isValidNetmask } from '$lib/engine/helpers';

	let n: Router | undefined = $derived(nodes.find((n) => n.uuid === editNode.uuid)) as
		Router | undefined;

	let selectedTab = $state<string>('general');

	$effect(() => {
		if (selectedTab.startsWith('interface-')) {
			highlightCable();
		} else {
			highlightedCable.uuid = '';
		}
	});

	onDestroy(() => {
		highlightedCable.uuid = '';
	});

	function highlightCable() {
		if (n) {
			if (!selectedTab.startsWith('interface-')) {
				return;
			}
			const index = parseInt(selectedTab.split('-')[1]);
			const iface = n.interfaces[index];
			const cable = iface.dataLinkLayer.cable;
			if (cable) {
				highlightedCable.uuid = cable.uuid;
			} else {
				highlightedCable.uuid = '';
			}
		}
	}
</script>

<ul class="nav nav-pills mb-3 align-items-center">
	<li class="nav-item">
		<button
			class="nav-link"
			class:active={selectedTab === 'general'}
			onclick={() => {
				selectedTab = 'general';
			}}
			aria-current="page">Allgemein</button
		>
	</li>
	<div class="border rounded-2 mx-2 d-flex flex-row p-1">
		{#each n?.interfaces as iface, index (iface.networkLayer.config.macAddress)}
			<li class="nav-item">
				<button
					class="nav-link"
					class:active={selectedTab === `interface-${index}`}
					onclick={() => {
						selectedTab = `interface-${index}`;
					}}
					aria-current="page">{iface.networkLayer.config.ipAddress}</button
				>
			</li>
		{/each}

		<li class="nav-item ms-1">
			<button
				class=" btn btn-outline-primary addInterfaceButton"
				onclick={() => {
					n?.addInterface();
				}}
				aria-current="page"
				><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640"
					><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
						d="M160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 160C544 124.7 515.3 96 480 96L160 96zM296 408L296 344L232 344C218.7 344 208 333.3 208 320C208 306.7 218.7 296 232 296L296 296L296 232C296 218.7 306.7 208 320 208C333.3 208 344 218.7 344 232L344 296L408 296C421.3 296 432 306.7 432 320C432 333.3 421.3 344 408 344L344 344L344 408C344 421.3 333.3 432 320 432C306.7 432 296 421.3 296 408z"
					/></svg
				></button
			>
		</li>
	</div>
	<li class="nav-item">
		<button
			class="nav-link"
			class:active={selectedTab === 'routingtable'}
			onclick={() => {
				selectedTab = 'routingtable';
			}}
			aria-current="page">Weiterleitungstabelle</button
		>
	</li>
</ul>

{#if selectedTab === 'general'}
	<div class="d-flex flex-row justify-content-center gap-3 mb-3">
		<label for="name" class="col-form-label">Name</label>
		<div>
			{#if n}
				<input bind:value={n.name} type="text" class="form-control" id="name" />
			{/if}
		</div>
	</div>
{:else if selectedTab.startsWith('interface-')}
	{@const iface = n?.interfaces[parseInt(selectedTab.split('-')[1])] as RouterInterface}
	<div class="d-grid inputGrid">
		<label for="ip" class="col-form-label">IP-Adresse</label>
		<div class="was-validated">
			{#if n}
				<input
					bind:value={iface.networkLayer.config.ipAddress}
					type="text"
					onchange={() => {
						n.updateConnectedRoute(iface);
						iface.dataLinkLayer.clearCaptureBuffer();
					}}
					class="form-control"
					pattern={IPv4Pattern}
					required
					id="ip"
				/>
			{/if}
		</div>
		<label for="netmask" class="col-form-label">Netzmaske</label>
		<div>
			{#if n}
				<input
					bind:value={iface.networkLayer.config.netmask}
					type="text"
					onchange={() => {
						n.updateConnectedRoute(iface);
						iface.dataLinkLayer.clearCaptureBuffer();
					}}
					class="form-control {iface.networkLayer.config.netmask &&
					!isValidNetmask(iface.networkLayer.config.netmask)
						? 'is-invalid'
						: 'is-valid'}"
					id="netmask"
					required
				/>
			{/if}
		</div>
		<label for="mac" class="col-form-label">MAC-Adresse</label>
		<div>
			{#if n}
				<input
					value={iface.networkLayer.config.macAddress}
					disabled
					type="text"
					class="form-control"
					id="mac"
				/>
			{/if}
		</div>
	</div>
	{#if n?.interfaces && n?.interfaces.length > 2}
		<button
			class="btn btn-danger mt-3"
			onclick={() => {
				n?.removeInterface(iface);
				selectedTab = 'general';
			}}>Schnittstelle entfernen</button
		>
	{/if}
{:else if selectedTab === 'routingtable'}
	<table class="table">
		<thead>
			<tr>
				<th scope="col">Ziel</th>
				<th scope="col">Netzmaske</th>
				<th scope="col">Nächstes Gateway</th>
				<th scope="col">Über Schnittstelle</th>
			</tr>
		</thead>
		<tbody>
			{#each n?.routingTable as route (route.iface.uuid)}
				<tr>
					<td>{route.subnet}</td>
					<td>{route.netmask}</td>
					<td>{route.nextHop}</td>
					<td>{route.iface.networkLayer.config.ipAddress}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.addInterfaceButton {
		padding: 0;
		height: 100%;
		width: 2.5rem;
	}

	.addInterfaceButton svg {
		path {
			fill: currentColor;
		}
	}

	.inputGrid {
		grid-template-columns: max-content 1fr;
		grid-gap: 0.5rem;
	}
</style>
