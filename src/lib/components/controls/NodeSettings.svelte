<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import HostSettings from '$lib/components/controls/NodeSettings/HostSettings.svelte';
	import SwitchSettings from '$lib/components/controls/NodeSettings/SwitchSettings.svelte';
	import RouterSettings from '$lib/components/controls/NodeSettings/RouterSettings.svelte';

	let type = $derived(nodes.find((n) => n.uuid === editNode.uuid)?.type);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class=" py-2"
	onclick={(e) => {
		e.stopPropagation();
	}}
>
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
