<script lang="ts">
	import { SvelteFlow, Background, BackgroundVariant } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	let nodes = $state([]);
	let edges = $state([]);
</script>

<SvelteFlow bind:nodes bind:edges fitView colorMode="system">
	<Background variant={BackgroundVariant.Dots} gap={12} size={1} />
</SvelteFlow>
