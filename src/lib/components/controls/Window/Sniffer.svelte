<script lang="ts">
	import { nodes } from '$lib/states/nodes.svelte';

	let { nodeUuid } = $props<{ nodeUuid: string }>();

	let node = $derived.by(() => {
		return nodes.find((n) => n.uuid === nodeUuid);
	});
</script>
