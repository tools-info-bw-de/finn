<script lang="ts">
	import laptop from '$lib/assets/laptop.png';

	interface Props {
		onAddHost: () => void;
	}

	let { onAddHost }: Props = $props();
</script>

<div class="d-flex flex-column">
	<button type="button" class="btn btn-primary" onclick={onAddHost}>
		<img src={laptop} alt="Laptop" width="32" height="32" />
	</button>
</div>
