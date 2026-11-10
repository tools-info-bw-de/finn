<script lang="ts">
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import NetworkCanvas from '$lib/components/controls/NetworkCanvas.svelte';
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

	:global([data-bs-theme='dark'] .form-control) {
		background-color: #1e1e1e;
	}

	:global([data-bs-theme='light'] .form-control, [data-bs-theme='light'] .form-check-input) {
		background-color: #ffffff;
	}

	:global([data-bs-theme='light'] .form-check-input:checked) {
		background-color: var(--bs-primary);
	}
</style>
