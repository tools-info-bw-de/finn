<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	const node = $derived(nodes.find((n) => n.uuid === editNode.uuid));
	const shownName = $derived(node?.name || '');
	const handleNameInput = (e: Event) => {
		if (node) node.name = (e.currentTarget as HTMLInputElement).value;
	};
</script>

<div class="d-flex flex-row gap-3 justify-content-between mx-4">
	<label for="name" class="col-form-label">Name</label>
	<div>
		<input
			value={shownName}
			oninput={handleNameInput}
			autofocus
			type="text"
			class="form-control"
			id="name"
		/>
	</div>
</div>
