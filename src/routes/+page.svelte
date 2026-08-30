<script lang="ts">
	import 'bootstrap';
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import NetworkCanvas from '$lib/components/controls/NetworkCanvas.svelte';
	import { editNode } from '$lib/states/nodes.svelte';
	import NodeSettings from '$lib/components/controls/NodeSettings.svelte';
	import { settings } from '$lib/states/settings.svelte';
</script>

<div class="d-flex flex-column vh-100 vw-100">
	<Navbar />

	<div class="d-flex flex-row flex-fill">
		{#if settings.mode === 'edit'}
			<DeviceSelector />
		{/if}
		<NetworkCanvas />
	</div>
	{#if settings.mode === 'edit' && editNode}
		<NodeSettings />
	{/if}
</div>
