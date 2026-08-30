<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import HostSettings from '$lib/components/controls/NodeSettings/HostSettings.svelte';

	let type = $derived(nodes.find((n) => n.uuid === editNode.uuid)?.type);
</script>

{type}
{#if type === 'notebook' || type === 'desktop'}
	<HostSettings />
{:else if type === 'switch'}
	<div>Switch settings</div>
{:else}
	<div>No node selected</div>
{/if}
