<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { Router, type RouterInterface } from '$lib/engine/Router.svelte';
	import type { DataLinkLayer } from '$lib/engine/DataLinkLayer.svelte';
	import { highlightedCable } from '$lib/states/cables.svelte';

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

	function highlightCable() {
		if (n) {
			if (!selectedTab.startsWith('interface-')) {
				return;
			}
			const index = parseInt(selectedTab.split('-')[1]);
			const iface = n.interfaces[index] as RouterInterface;
			const lowerLayer = iface.lowerLayer;
			if (lowerLayer) {
				const cable = (lowerLayer as DataLinkLayer).cable;
				if (cable) {
					highlightedCable.uuid = cable.uuid;
				}
			}
		}
	}
</script>

<ul class="nav nav-pills">
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
	<div class="row mb-3">
		<label for="name" class="col-sm-2 col-form-label">Name</label>
		<div class="col-sm-10">
			{#if n}
				<input bind:value={n.name} type="text" class="form-control" id="name" />
			{/if}
		</div>
	</div>
{:else if selectedTab.startsWith('interface-')}
	<div class="row mb-3">
		<label for="ip" class="col-sm-2 col-form-label">IP-Adresse</label>
		<div class="col-sm-10">
			{#if n}
				<input
					bind:value={
						(n.interfaces[parseInt(selectedTab.split('-')[1])] as RouterInterface).networkLayer
							.config.ipAddress
					}
					type="text"
					class="form-control"
					id="ip"
				/>
			{/if}
		</div>
	</div>
	<div class="row mb-3">
		<label for="netmask" class="col-sm-2 col-form-label">Netzmaske</label>
		<div class="col-sm-10">
			{#if n}
				<input
					bind:value={
						(n.interfaces[parseInt(selectedTab.split('-')[1])] as RouterInterface).networkLayer
							.config.netmask
					}
					type="text"
					class="form-control"
					id="netmask"
				/>
			{/if}
		</div>
	</div>
	<div class="row mb-3">
		<label for="mac" class="col-sm-2 col-form-label">MAC-Adresse</label>
		<div class="col-sm-10">
			{#if n}
				<input
					value={(n.interfaces[parseInt(selectedTab.split('-')[1])] as RouterInterface).networkLayer
						.config.macAddress}
					disabled
					type="text"
					class="form-control"
					id="mac"
				/>
			{/if}
		</div>
	</div>
{:else if selectedTab === 'routingtable'}
	<div class="px-4 py-2">
		<h5>Weiterleitungstabelle</h5>
		<p>Hier können die Einträge in der Weiterleitungstabelle des Routers verwaltet werden.</p>
	</div>
{/if}
