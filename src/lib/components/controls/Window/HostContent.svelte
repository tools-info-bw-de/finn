<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import startMenu from '$lib/assets/start-menu.png';
	import Terminal from './Host/Terminal.svelte';

	let { host }: { host: Host } = $props();
</script>

<div class="d-flex flex-column h-100">
	<div class="windowArea">
		<Terminal {host} />
	</div>

	<div class="footer">
		<button class="startMenuButton"><img src={startMenu} alt="Icon" /> Start</button>
	</div>
</div>

<style>
	.windowArea {
		flex: 1;
		overflow: hidden;
	}

	.footer {
		position: sticky;
		bottom: 0;
		width: 100%;
		height: 32px;
		background-color: #7cafba;
	}

	.startMenuButton {
		height: 32px;
		border: none;
	}

	.startMenuButton img {
		height: 100%;
	}
</style>
