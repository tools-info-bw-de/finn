<script lang="ts">
	import { nodes } from '$lib/states/nodes.svelte';
	import { cubicOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';
	import SwitchSAT from '$lib/components/controls/Window/SwitchSAT.svelte';
	import Sniffer from './Window/Sniffer.svelte';
	import { Router } from '$lib/engine/Router.svelte';
	import HostContent from './Window/HostContent.svelte';
	import { Host } from '$lib/engine/Host.svelte';

	let {
		nodeUuid,
		isSniffer,
		sniffedNode,
		x = $bindable(100),
		y = $bindable(100),
		width = $bindable(320),
		height = $bindable(220),
		zIndex = 100,
		onClose,
		onFocus
	}: {
		nodeUuid: string;
		isSniffer: boolean;
		sniffedNode?: string;
		x: number;
		y: number;
		width: number;
		height: number;
		zIndex: number;
		onClose: () => void;
		onFocus: () => void;
	} = $props();

	let type = $derived(nodes.find((n) => n.uuid === nodeUuid)?.type);
	let host = $derived.by(() => {
		return nodes.find((n) => n.uuid === nodeUuid) as Host;
	});

	let title = $derived.by(() => {
		let node = nodes.find((n) => n.uuid === nodeUuid);
		if (!node) return 'Unknown Node';
		if (type === 'notebook' || type === 'desktop') {
			return `${node.name} (${(node as Host).config.ipAddress})`;
		} else if (type === 'switch') {
			return `${node.name} (Switch SAT Tabelle)`;
		}
		return node.name;
	});

	let windowEl = $state<HTMLDivElement | null>(null);
	let headerEl = $state<HTMLDivElement | null>(null);

	/**
	 * Hält das Fenster im sichtbaren Bereich (Container des Fensters):
	 * links/rechts darf höchstens die halbe Breite hinausragen,
	 * oben/unten muss die Titelleiste vollständig sichtbar bleiben.
	 */
	function clampPosition() {
		const container = windowEl?.offsetParent as HTMLElement | null;
		if (!container) return;
		const headerHeight = headerEl?.offsetHeight ?? 0;
		const maxX = container.clientWidth - width / 2;
		const maxY = container.clientHeight - headerHeight;
		x = Math.min(Math.max(x, -width / 2), Math.max(maxX, -width / 2));
		y = Math.min(Math.max(y, 0), Math.max(maxY, 0));
	}

	// Beim Öffnen (z. B. aus einer Speicherdatei) und wenn sich der Container ändert (Browserfenster)
	$effect(() => {
		const container = windowEl?.offsetParent;
		if (!container) return;
		const observer = new ResizeObserver(() => clampPosition());
		observer.observe(container);
		return () => observer.disconnect();
	});

	let isDragging = false;
	let isResizing = false;
	let dragOffset = { x: 0, y: 0 };

	type ResizeDirection = 'left' | 'right' | 'top' | 'bottom' | 'bottom-right';
	let resizeDirection: ResizeDirection = 'bottom-right';
	let startResizePointer = { x: 0, y: 0 };
	let startResizeBounds = { x: 0, y: 0, width: 0, height: 0 };

	// --- VERSCHIEBEN (DRAG) ---
	function handleHeaderPointerDown(e: PointerEvent) {
		// 1. SCHUTZ: Falls der Schließen-Button geklickt wurde, Dragging ignorieren
		if ((e.target as HTMLElement).closest('.close-btn')) {
			return;
		}

		e.stopPropagation();
		onFocus();
		isDragging = true;
		dragOffset = { x: e.clientX - x, y: e.clientY - y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleHeaderPointerMove(e: PointerEvent) {
		if (isDragging) {
			x = e.clientX - dragOffset.x;
			y = e.clientY - dragOffset.y;
			clampPosition();
		}
	}

	function handleHeaderPointerUp(e: PointerEvent) {
		if (isDragging) {
			isDragging = false;
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}

	// --- GRÖSSE ÄNDERN (RESIZE) ---
	function handleResizePointerDown(e: PointerEvent, direction: ResizeDirection) {
		e.stopPropagation();
		onFocus();
		isResizing = true;
		resizeDirection = direction;

		// Startwerte beim ersten Anpacken sichern
		startResizePointer = { x: e.clientX, y: e.clientY };
		startResizeBounds = { x, y, width, height };

		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleResizePointerMove(e: PointerEvent) {
		if (isResizing) {
			// Differenz seit dem Klick berechnen
			const dx = e.clientX - startResizePointer.x;
			const dy = e.clientY - startResizePointer.y;

			// Linke/obere Kante verschieben beim Ändern den Fensterursprung;
			// die gegenüberliegende Kante bleibt dabei an ihrer Position.
			if (resizeDirection === 'left') {
				width = Math.max(200, startResizeBounds.width - dx);
				x = startResizeBounds.x + startResizeBounds.width - width;
			} else if (resizeDirection === 'right' || resizeDirection === 'bottom-right') {
				width = Math.max(200, startResizeBounds.width + dx);
			}

			if (resizeDirection === 'top') {
				// Obere Kante nicht über den sichtbaren Bereich hinaus ziehen
				const bottom = startResizeBounds.y + startResizeBounds.height;
				height = Math.min(Math.max(120, startResizeBounds.height - dy), Math.max(bottom, 120));
				y = bottom - height;
			} else if (resizeDirection === 'bottom' || resizeDirection === 'bottom-right') {
				height = Math.max(120, startResizeBounds.height + dy);
			}
		}
	}

	function handleResizePointerUp(e: PointerEvent) {
		if (isResizing) {
			isResizing = false;
			const target = e.currentTarget as HTMLElement;
			if (target.hasPointerCapture(e.pointerId)) {
				target.releasePointerCapture(e.pointerId);
			}
		}
	}
</script>

<!-- Fenster Element -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="window"
	bind:this={windowEl}
	style="left: {x}px; top: {y}px; width: {width}px; height: {height}px; z-index: {zIndex};"
	onpointerdown={onFocus}
	transition:scale={{ duration: 180, start: 0.92, opacity: 0, easing: cubicOut }}
>
	<!-- Header / Drag Handle -->
	<div
		class="window-header"
		bind:this={headerEl}
		onpointerdown={handleHeaderPointerDown}
		onpointermove={handleHeaderPointerMove}
		onpointerup={handleHeaderPointerUp}
	>
		<span class="title">
			{#if isSniffer}
				{@const sniffedNodeData = nodes.find((n) => n.uuid === sniffedNode)}
				{@const sniffedNodeType = sniffedNodeData?.type}
				{@const ip =
					sniffedNodeType === 'router'
						? (sniffedNodeData as Router)?.interfaces.find((i) => i.dataLinkLayer.uuid === nodeUuid)
								?.config.ipAddress
						: (sniffedNodeData as Host)?.config.ipAddress}
				Datenaustausch: {sniffedNodeData?.name} ({ip})
			{:else}
				{title}
			{/if}
		</span>
		<button
			class="close-btn"
			onclick={(e) => {
				e.stopPropagation();
				onClose();
			}}>✕</button
		>
	</div>

	<!-- Inhalt -->
	<div class="window-content">
		{#if isSniffer}
			<Sniffer nodeUuid={sniffedNode!} linkLayerUuid={nodeUuid} />
		{:else if type === 'notebook' || type === 'desktop'}
			<HostContent {host} />
		{:else if type === 'switch'}
			<SwitchSAT switch_wifi={nodes.find((n) => n.uuid === nodeUuid) as SwitchWifi} />
		{/if}
	</div>

	<!-- Resize-Griffe an allen Kanten; der bisherige Eckgriff bleibt unten rechts. -->
	<div
		class="resize-edge-handle resize-edge-left"
		onpointerdown={(e) => handleResizePointerDown(e, 'left')}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
		onpointercancel={handleResizePointerUp}
	></div>
	<div
		class="resize-edge-handle resize-edge-top"
		onpointerdown={(e) => handleResizePointerDown(e, 'top')}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
		onpointercancel={handleResizePointerUp}
	></div>
	<div
		class="resize-edge-handle resize-edge-right"
		onpointerdown={(e) => handleResizePointerDown(e, 'right')}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
		onpointercancel={handleResizePointerUp}
	></div>
	<div
		class="resize-edge-handle resize-edge-bottom"
		onpointerdown={(e) => handleResizePointerDown(e, 'bottom')}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
		onpointercancel={handleResizePointerUp}
	></div>
	<div
		class="resize-handle"
		onpointerdown={(e) => handleResizePointerDown(e, 'bottom-right')}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
		onpointercancel={handleResizePointerUp}
	></div>
</div>

<style>
	.window {
		position: absolute;
		border: 1px solid #45475a;
		border-radius: 8px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		user-select: none;
		cursor: default;
		color: var(--bs-body-color);
	}

	:global([data-bs-theme='light'] .window) {
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
		border-color: #d1d5db;
	}

	.window-header {
		padding: 4px 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: move;
		border-bottom: 1px solid #45475a;
	}

	:global([data-bs-theme='dark'] .window-header) {
		background: #313244;
		border-bottom: 1px solid #45475a;
		color: #cdd6f4;
	}

	:global([data-bs-theme='light'] .window-header) {
		background: #dbdde0;
		border-bottom: 1px solid #45475a;
	}

	.title {
		font-weight: bold;
		font-size: 13px;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #a6adc8;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		padding: 0;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
	}

	.close-btn:hover {
		background: #f38ba8;
		color: #11111b;
	}

	.window-content {
		flex: 1;
		overflow: auto;
	}

	.resize-edge-handle {
		position: absolute;
		z-index: 1;
		touch-action: none;
	}

	.resize-edge-left,
	.resize-edge-right {
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: ew-resize;
	}

	.resize-edge-left {
		left: 0;
	}

	.resize-edge-right {
		right: 0;
	}

	.resize-edge-top,
	.resize-edge-bottom {
		left: 0;
		right: 0;
		height: 8px;
		cursor: ns-resize;
	}

	.resize-edge-top {
		top: 0;
	}

	.resize-edge-bottom {
		bottom: 0;
	}

	.resize-handle {
		position: absolute;
		z-index: 2;
		right: 0;
		bottom: 0;
		width: 20px;
		height: 20px;
		cursor: nwse-resize;
		background: linear-gradient(135deg, transparent 50%, #585b70 50%);
		border-bottom-right-radius: 8px;
		touch-action: none;
	}
</style>
