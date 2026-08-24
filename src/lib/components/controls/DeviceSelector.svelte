<script lang="ts">
	import laptop from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';

	interface Props {
		createNode: (type: 'notebook' | 'desktop' | 'switch') => void;
	}

	let { createNode }: Props = $props();
</script>

<div class="d-flex flex-column">
	<button type="button" class="btn btn-primary" onclick={() => createNode('notebook')}>
		<img src={laptop} alt="Laptop" width="32" height="32" />
	</button>
	<button type="button" class="btn btn-primary" onclick={() => createNode('desktop')}>
		<img src={desktop} alt="Desktop" width="32" height="32" />
	</button>
	<button type="button" class="btn btn-primary" onclick={() => createNode('switch')}>
		<img src={switch_wifi} alt="Switch" width="32" height="32" />
	</button>
</div>
