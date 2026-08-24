<script lang="ts">
	import { nodes } from '$lib/states/nodes.svelte';
	import { cables, newCable } from '$lib/states/cables.svelte';
	import cable from '$lib/assets/cable.png';

	/* interface Props {
		nodes: NetworkNode[];
	}
	let { nodes }: Props = $props(); */

	let pan = $state({ x: 0, y: 0 });
	let zoom = $state(1);

	const MIN_ZOOM = 0.3;
	const MAX_ZOOM = 2.0;

	let isPanning = $state(false);
	let draggingNodeId = $state<string | null>(null);

	// Startpositionen für exakte Differenzberechnung
	let startPointer = { x: 0, y: 0 };
	let startPan = { x: 0, y: 0 };
	let startNodePos = { x: 0, y: 0 };

	function getNodeCenter(nodeUuid: string) {
		const node = nodes.find((n) => n.uuid === nodeUuid);
		if (!node) return { x: 0, y: 0 };
		return {
			x: node.x + 64 / 2,
			y: node.y + 64 / 2
		};
	}

	function getCubicPath(x1: number, y1: number, x2: number, y2: number) {
		const dx = Math.abs(x2 - x1) * 0.5;
		return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
	}

	// 1. Zoom per Mausrad
	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
		const newZoom = Math.min(Math.max(zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM);

		if (newZoom === zoom) return;

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const scaleChange = newZoom / zoom;
		pan.x = mouseX - (mouseX - pan.x) * scaleChange;
		pan.y = mouseY - (mouseY - pan.y) * scaleChange;

		zoom = newZoom;
	}

	// 2. Klick auf den Hintergrund (Karten-Pan starten)
	function handleViewportPointerDown(e: PointerEvent) {
		// Sicherheits-Check: Falls e.stopPropagation am Knoten fehlschlägt
		if ((e.target as HTMLElement).closest('.network-node')) return;

		isPanning = true;
		startPointer = { x: e.clientX, y: e.clientY };
		startPan = { x: pan.x, y: pan.y };
	}

	// 3. Klick auf Node (Node-Drag starten)
	function handleNodePointerDown(e: PointerEvent, uuid: string) {
		e.stopPropagation(); // Verhindert Karten-Pan
		draggingNodeId = uuid;

		if (newCable.adding) {
			if (!newCable.uuids.includes(uuid)) {
				newCable.uuids.push(uuid);
			}
			return; // Kein Dragging, wenn wir gerade ein Kabel hinzufügen
		}

		const node = nodes.find((n) => n.uuid === uuid);
		if (node) {
			startPointer = { x: e.clientX, y: e.clientY };
			startNodePos = { x: node.x, y: node.y };
		}
	}

	// 4. Globale Bewegung verarbeiten (über <svelte:window>)
	function handleWindowPointerMove(e: PointerEvent) {
		const dx = e.clientX - startPointer.x;
		const dy = e.clientY - startPointer.y;

		if (isPanning) {
			pan.x = startPan.x + dx;
			pan.y = startPan.y + dy;
		} else if (draggingNodeId) {
			const node = nodes.find((n) => n.uuid === draggingNodeId);
			if (node) {
				// WICHTIG: Distanz durch Zoom teilen!
				node.x = startNodePos.x + dx / zoom;
				node.y = startNodePos.y + dy / zoom;
			}
		}

		if (newCable.adding) {
			let cableTooltip = document.querySelector('.cable-tooltip') as HTMLElement;

			let x = e.clientX;
			let y = e.clientY;
			cableTooltip.style.left = `${x}px`;
			cableTooltip.style.top = `${y}px`;
		}
	}

	// 5. Drag beenden
	function handleWindowPointerUp() {
		isPanning = false;
		draggingNodeId = null;
	}
</script>

<!-- Globale Event-Listener garantieren, dass Dragging nicht abbricht wenn man schnell zieht -->
<svelte:window onpointermove={handleWindowPointerMove} onpointerup={handleWindowPointerUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="viewport"
	class:panning={isPanning}
	style="background-size: {24 * zoom}px {24 *
		zoom}px; background-position: {pan.x}px {pan.y}px; background-image: radial-gradient(#45475a {1 *
		zoom}px, transparent {1 * zoom}px);"
	onwheel={handleWheel}
	onpointerdown={handleViewportPointerDown}
>
	<button class="zoom-indicator" onclick={() => (zoom = 1)}>{Math.round(zoom * 100)}%</button>

	<div class="world" style="transform: translate({pan.x}px, {pan.y}px) scale({zoom});">
		<svg class="svg-layer">
			{#each cables as c (c.cableuuid)}
				{@const start = getNodeCenter(c.from)}
				{@const end = getNodeCenter(c.to)}
				<path d={getCubicPath(start.x, start.y, end.x, end.y)} class="cable" />
			{/each}
		</svg>

		{#each nodes as node (node.uuid)}
			<div
				class="network-node"
				style="left: {node.x}px; top: {node.y}px; width: 64px; height: 64px;"
				onpointerdown={(e) => handleNodePointerDown(e, node.uuid)}
			>
				<div class="node-header">{node.name}</div>
				<div class="node-body">Pos: {Math.round(node.x)}, {Math.round(node.y)}</div>
			</div>
		{/each}
	</div>

	{#if newCable.adding}
		<div class="cable-tooltip">
			<img src={cable} alt="Cable" width="32" height="32" />
		</div>
	{/if}
</div>

<style>
	.cable-tooltip {
		position: absolute;
		background: #313244;
		color: #cdd6f4;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: bold;
		z-index: 10;
		border: 1px solid #45475a;
	}

	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		background-color: #1e1e2e;
		overflow: hidden;
		user-select: none;
		cursor: grab;
		/* ESSENZIELL: Verhindert, dass der Browser Gesten abfängt */
		touch-action: none;
	}

	.viewport.panning {
		cursor: grabbing;
	}

	.zoom-indicator {
		position: absolute;
		top: 16px;
		right: 16px;
		background: #313244;
		color: #cdd6f4;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: bold;
		z-index: 10;
		border: 1px solid #45475a;
	}

	.world {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		transform-origin: 0 0;
		will-change: transform;
	}

	.svg-layer {
		position: absolute;
		width: 100%;
		height: 100%;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}

	.cable {
		stroke: #89b4fa;
		stroke-width: 3px;
		fill: none;
	}

	.network-node {
		position: absolute;
		background: #313244;
		border: 2px solid #45475a;
		border-radius: 8px;
		color: #cdd6f4;
		cursor: move;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		/* ESSENZIELL: Verhindert Text-Selection & Touch-Gesten */
		touch-action: none;
	}

	.node-header {
		background: #181825;
		padding: 6px 10px;
		font-weight: bold;
		font-size: 13px;
		border-top-left-radius: 6px;
		border-top-right-radius: 6px;
	}

	.node-body {
		padding: 8px 10px;
		font-size: 11px;
		color: #a6adc8;
	}
</style>
