<script lang="ts">
	import 'bootstrap';
	import Navbar from '$lib/components/controls/Navbar.svelte';
	import DeviceSelector from '$lib/components/controls/DeviceSelector.svelte';
	import Network from '$lib/components/controls/Network.svelte';
</script>

<div class="d-flex flex-column vh-100 vw-100">
	<Navbar />

	<div class="d-flex flex-row flex-fill">
		<DeviceSelector />
		<Network />
	</div>
	<div class="h-25"></div>
</div>
