<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import HostSettings from '$lib/components/controls/NodeSettings/HostSettings.svelte';
	import SwitchSettings from '$lib/components/controls/NodeSettings/SwitchSettings.svelte';
	import RouterSettings from '$lib/components/controls/NodeSettings/RouterSettings.svelte';

	let type = $derived(nodes.find((n) => n.uuid === editNode.uuid)?.type);
</script>

<div class="px-4 py-2">
	{#if type === 'notebook' || type === 'desktop'}
		<HostSettings />
	{:else if type === 'switch'}
		<div><SwitchSettings /></div>
	{:else if type === 'router'}
		<div><RouterSettings /></div>
	{:else}
		<div>No node selected</div>
	{/if}
</div>
