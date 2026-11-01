<script lang="ts">
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import NetworkCanvas from '$lib/components/controls/NetworkCanvas.svelte';
	import { editNode } from '$lib/states/nodes.svelte';
	import NodeSettings from '$lib/components/controls/NodeSettings.svelte';
	import { settings } from '$lib/states/settings.svelte';
</script>

<div class="page-layout d-flex flex-column vh-100 vw-100">
	<Navbar />

	<div class="workspace d-flex flex-row flex-fill">
		{#if settings.mode === 'edit'}
			<DeviceSelector />
		{/if}
		<NetworkCanvas />
	</div>
	{#if settings.mode === 'edit' && editNode.uuid}
		<NodeSettings />
	{/if}
</div>

<style>
	.page-layout {
		overflow: hidden;
	}

	.workspace {
		position: relative;
		min-height: 0;
		overflow: hidden;
	}
</style>
