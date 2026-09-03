<script lang="ts">
	import { nodes } from '$lib/states/nodes.svelte';
	import type { Host } from '$lib/engine/Host.svelte';
	import { cubicOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import Terminal from '$lib/components/controls/Window/Host/Terminal.svelte';
	import { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';
	import SwitchSAT from '$lib/components/controls/Window/SwitchSAT.svelte';

	let {
		nodeUuid,
		x = $bindable(100),
		y = $bindable(100),
		width = $bindable(320),
		height = $bindable(220),
		zIndex = 100,
		onClose,
		onFocus
	}: {
		nodeUuid: string;
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

	let isDragging = false;
	let isResizing = false;
	let dragOffset = { x: 0, y: 0 };

	let startResizePointer = { x: 0, y: 0 };
	let startResizeSize = { width: 0, height: 0 };

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
		}
	}

	function handleHeaderPointerUp(e: PointerEvent) {
		if (isDragging) {
			isDragging = false;
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}

	// --- GRÖSSE ÄNDERN (RESIZE) ---
	function handleResizePointerDown(e: PointerEvent) {
		e.stopPropagation();
		onFocus();
		isResizing = true;

		// Startwerte beim ersten Anpacken sichern
		startResizePointer = { x: e.clientX, y: e.clientY };
		startResizeSize = { width, height };

		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleResizePointerMove(e: PointerEvent) {
		if (isResizing) {
			// Differenz seit dem Klick berechnen
			const dx = e.clientX - startResizePointer.x;
			const dy = e.clientY - startResizePointer.y;

			// Neue Größe = Ursprungsgröße + zurückgelegter Weg
			width = Math.max(200, startResizeSize.width + dx);
			height = Math.max(120, startResizeSize.height + dy);
		}
	}

	function handleResizePointerUp(e: PointerEvent) {
		if (isResizing) {
			isResizing = false;
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}
</script>

<!-- Fenster Element -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="window"
	style="left: {x}px; top: {y}px; width: {width}px; height: {height}px; z-index: {zIndex};"
	onpointerdown={onFocus}
	transition:scale={{ duration: 180, start: 0.92, opacity: 0, easing: cubicOut }}
>
	<!-- Header / Drag Handle -->
	<div
		class="window-header"
		onpointerdown={handleHeaderPointerDown}
		onpointermove={handleHeaderPointerMove}
		onpointerup={handleHeaderPointerUp}
	>
		<span class="title">{title}</span>
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
		{#if type === 'notebook' || type === 'desktop'}
			<Terminal {host} />
		{:else if type === 'switch'}
			<SwitchSAT switch_wifi={nodes.find((n) => n.uuid === nodeUuid) as SwitchWifi} />
		{/if}
	</div>

	<!-- Resize Handle unten rechts -->
	<div
		class="resize-handle"
		onpointerdown={handleResizePointerDown}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerUp}
	></div>
</div>

<style>
	.window {
		position: absolute;
		background: #1e1e2e;
		border: 1px solid #45475a;
		border-radius: 8px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		user-select: none;
	}

	.window-header {
		background: #313244;
		padding: 4px 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: move;
		border-bottom: 1px solid #45475a;
	}

	.title {
		font-weight: bold;
		font-size: 13px;
		color: #cdd6f4;
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
		color: #cdd6f4;
	}

	.resize-handle {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 16px;
		height: 16px;
		cursor: nwse-resize;
		background: linear-gradient(135deg, transparent 50%, #585b70 50%);
		border-bottom-right-radius: 8px;
	}
</style>
