<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title = 'Fenster',
		x = $bindable(100),
		y = $bindable(100),
		width = $bindable(320),
		height = $bindable(220),
		zIndex = 100,
		onClose,
		onFocus,
		children
	}: {
		title: string;
		x: number;
		y: number;
		width: number;
		height: number;
		zIndex: number;
		onClose: () => void;
		onFocus: () => void;
		children?: Snippet;
	} = $props();

	let isDragging = false;
	let isResizing = false;
	let dragOffset = { x: 0, y: 0 };

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
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleResizePointerMove(e: PointerEvent) {
		if (isResizing) {
			// Mindestgröße von 200x120px einhalten
			width = Math.max(200, e.clientX - x);
			height = Math.max(120, e.clientY - y);
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
		{@render children?.()}
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
		padding: 12px;
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
