<script lang="ts">
	import favicon from '$lib/assets/letter-f.png';
	import 'bootstrap';
	import '../app.scss';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Finn</title>
</svelte:head>

{@render children()}
