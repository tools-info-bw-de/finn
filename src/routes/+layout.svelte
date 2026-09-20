<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import 'bootstrap';
	import 'bootstrap/dist/css/bootstrap.min.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
