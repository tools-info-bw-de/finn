<script lang="ts">
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import { cables, newCable } from '$lib/states/cables.svelte';
	import cable from '$lib/assets/cable.png';
	import notebook from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';
	import { Host } from '$lib/engine/Host.svelte';

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

	function allowedCableConnection(nodeUuid: string): boolean {
		const node = nodes.find((n) => n.uuid === nodeUuid);
		if (!node) return false;

		if (node.type === 'notebook' || node.type === 'desktop') {
			const host = node as Host;
			return host.dataLinkLayer.cable === undefined; // Host kann nur 1 Kabel haben
		} else if (node.type === 'switch') {
			return true;
		} else {
			return false;
		}
	}

	// 3. Klick auf Node (Node-Drag starten)
	function handleNodePointerDown(e: PointerEvent, uuid: string) {
		e.stopPropagation(); // Verhindert Karten-Pan
		draggingNodeId = uuid;

		if (newCable.adding) {
			if (!allowedCableConnection(uuid)) {
				console.log('Cannot connect cable to this node type');
				//TODO Mauszeiger ändern, dass es nicht erlaubt ist
				//ODER: toast anzeigen
				return;
			}

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

	let mouse = $state({
		x: 0,
		y: 0
	});

	function screenToWorld(clientX: number, clientY: number) {
		const rect = (
			document.querySelector('.viewport') as HTMLElement | null
		)?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };

		return {
			x: (clientX - rect.left - pan.x) / zoom,
			y: (clientY - rect.top - pan.y) / zoom
		};
	}

	let isDraggingNode = $state(false);
	// 4. Globale Bewegung verarbeiten (über <svelte:window>)
	function handleWindowPointerMove(e: PointerEvent) {
		const worldPos = screenToWorld(e.clientX, e.clientY);
		mouse.x = worldPos.x;
		mouse.y = worldPos.y;

		const dx = e.clientX - startPointer.x;
		const dy = e.clientY - startPointer.y;

		if (isPanning) {
			pan.x = startPan.x + dx;
			pan.y = startPan.y + dy;
		} else if (draggingNodeId) {
			// Prüfen, ob große Entfernung bewegt wird, oder nur geklickt wird
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
				isDraggingNode = true;
			}

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
		if (!isDraggingNode) {
			handleNodeClick();
		}

		isPanning = false;
		isDraggingNode = false;
		draggingNodeId = null;
	}

	function handleNodeClick() {
		if (draggingNodeId) {
			const node = nodes.find((n) => n.uuid === draggingNodeId);
			if (node) {
				editNode.uuid = node.uuid;
			}
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (newCable.adding) {
				newCable.adding = false;
				newCable.uuids = [];
			}
		}
	}

	function getImageForNodeType(type: string) {
		switch (type) {
			case 'notebook':
				return notebook;
			case 'desktop':
				return desktop;
			case 'switch':
				return switch_wifi;
			default:
				return '';
		}
	}
</script>

<!-- Globale Event-Listener garantieren, dass Dragging nicht abbricht wenn man schnell zieht -->
<svelte:window
	onpointermove={handleWindowPointerMove}
	onpointerup={handleWindowPointerUp}
	onkeydown={handleKeyDown}
/>

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
				{@const isTransmitting = c.cable.isTransmitting}
				<path
					class:transmitting={isTransmitting}
					d={getCubicPath(start.x, start.y, end.x, end.y)}
					class="cable"
				/>
			{/each}
			{#if newCable.adding && newCable.uuids.length === 1}
				{@const start = getNodeCenter(newCable.uuids[0])}
				{@const end = { x: mouse.x, y: mouse.y }}
				<path d={getCubicPath(start.x, start.y, end.x, end.y)} class="cable" />
			{/if}
		</svg>

		{#each nodes as node (node.uuid)}
			<div
				class="network-node"
				style="left: {node.x}px; top: {node.y}px; width: 64px; height: 64px;"
				onpointerdown={(e) => handleNodePointerDown(e, node.uuid)}
			>
				<img
					src={getImageForNodeType(node.type)}
					alt={node.type}
					width="64"
					height="64"
					draggable={false}
				/>
				<div class="nodeName">{node.name}</div>
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
		position: fixed;
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

	.cable.transmitting {
		stroke: #f38ba8 !important;
		stroke-width: 4px;
	}

	.network-node {
		position: absolute;
		border-radius: 8px;
		border: 2px solid transparent;
		color: #cdd6f4;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		/* ESSENZIELL: Verhindert Text-Selection & Touch-Gesten */
		touch-action: none;
	}
</style>
