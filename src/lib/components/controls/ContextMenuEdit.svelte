<script lang="ts">
	import { nodes } from '$lib/states/nodes.svelte';
	import { Host } from '$lib/engine/Host.svelte';
	import type { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';
	import { removeCable } from '$lib/states/cables.svelte';

	let { uuid, x, y } = $props<{ uuid: string; x: number; y: number }>();

	function deleteNode() {
		deleteConnections();
		nodes.splice(
			nodes.findIndex((n) => n.uuid === uuid),
			1
		);
	}

	function deleteConnections() {
		let type = nodes.find((n) => n.uuid === uuid)?.type;
		if (type === 'notebook' || type === 'desktop') {
			let host = nodes.find((n) => n.uuid === uuid) as Host;
			if (host.dataLinkLayer.cable) {
				removeCable(host.dataLinkLayer.cable!.uuid);
			}
		} else if (type === 'switch') {
			let switchNode = nodes.find((n) => n.uuid === uuid) as SwitchWifi;
			switchNode?.ports.forEach((port) => {
				if (port.cable) {
					removeCable(port.cable!.uuid);
				}
			});
		}
	}
</script>

<div class="list-group" style="left:{x}px; top:{y}px;">
	<button onclick={deleteNode} class="list-group-item list-group-item-action">
		<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
			><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
				d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"
			/></svg
		>
		Löschen
	</button>
	<button onclick={deleteConnections} class="list-group-item list-group-item-action">
		<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
			><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
				d="M256 320L216.5 359.5C203.9 354.6 190.3 352 176 352C114.1 352 64 402.1 64 464C64 525.9 114.1 576 176 576C237.9 576 288 525.9 288 464C288 449.7 285.3 436.1 280.5 423.5L563.2 140.8C570.3 133.7 570.3 122.3 563.2 115.2C534.9 86.9 489.1 86.9 460.8 115.2L320 256L280.5 216.5C285.4 203.9 288 190.3 288 176C288 114.1 237.9 64 176 64C114.1 64 64 114.1 64 176C64 237.9 114.1 288 176 288C190.3 288 203.9 285.3 216.5 280.5L256 320zM353.9 417.9L460.8 524.8C489.1 553.1 534.9 553.1 563.2 524.8C570.3 517.7 570.3 506.3 563.2 499.2L417.9 353.9L353.9 417.9zM128 176C128 149.5 149.5 128 176 128C202.5 128 224 149.5 224 176C224 202.5 202.5 224 176 224C149.5 224 128 202.5 128 176zM176 416C202.5 416 224 437.5 224 464C224 490.5 202.5 512 176 512C149.5 512 128 490.5 128 464C128 437.5 149.5 416 176 416z"
			/></svg
		>
		Verbindungen entfernen
	</button>
</div>

<style>
	.list-group {
		position: fixed;
		z-index: 1000;
	}

	.list-group button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
