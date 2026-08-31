<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	const node = $derived(nodes.find((n) => n.uuid === editNode.uuid));
	const shownName = $derived(node?.name || '');
	const handleNameInput = (e: Event) => {
		if (node) node.name = (e.currentTarget as HTMLInputElement).value;
	};
</script>

<div class="d-flex flex-row justify-content-between mx-4">
	<form>
		<div class="row mb-3">
			<label for="name" class="col-sm-2 col-form-label">Name</label>
			<div class="col-sm-10">
				<input
					value={shownName}
					oninput={handleNameInput}
					type="text"
					class="form-control"
					id="name"
				/>
			</div>
		</div>
	</form>
</div>
