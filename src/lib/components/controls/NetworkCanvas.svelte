<script lang="ts">
	import { nodes, editNode, nodeToSniff, nodeSpawn, windows } from '$lib/states/nodes.svelte';
	import { cables, highlightedCable, newCable, removeCable } from '$lib/states/cables.svelte';
	import cable from '$lib/assets/cable.png';
	import notebook from '$lib/assets/laptop.png';
	import desktop from '$lib/assets/desktop.png';
	import switch_wifi from '$lib/assets/switch-wifi.png';
	import router from '$lib/assets/router.png';
	import { Host } from '$lib/engine/Host.svelte';
	import { settings } from '$lib/states/settings.svelte';
	import Window from '$lib/components/controls/Window.svelte';
	import ContextMenuEdit from './ContextMenuEdit.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import ContextMenuPlay from './ContextMenuPlay.svelte';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { pan, zoom } from '$lib/states/canvas.svelte';
	import ServersOnHost from './ServersOnHost.svelte';
	import PacketNotices from './PacketNotices.svelte';
	import NodeSettings from './NodeSettings.svelte';

	//let windows = $state<WindowData[]>([]);
	let visibleWindows = $derived.by(() => {
		if (settings.mode === 'edit') {
			return [];
		} else {
			return windows.filter((w) => {
				return w.open;
			});
		}
	});

	$effect(() => {
		if (settings.mode === 'edit') {
			focusedWindowUuid = null;
		}
	});

	let windowsMaxZIndex = $state(100);
	// nodeUuid des fokussierten Fensters (bei Sniffern die UUID des DataLinkLayers), null = keins
	let focusedWindowUuid = $state<string | null>(null);
	let viewportEl: HTMLDivElement;

	const MIN_ZOOM = 0.3;
	const MAX_ZOOM = 2.0;

	function updateNodeSpawn() {
		nodeSpawn.x = (viewportEl.clientWidth / 6 - pan.x) / zoom.value;
		nodeSpawn.y = (viewportEl.clientHeight / 5 - pan.y) / zoom.value;
	}

	onMount(() => {
		updateNodeSpawn();
	});

	let isPanning = $state(false);
	let draggingNodeUuid = $state<string | null>(null);

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

	function getCablePath(x1: number, y1: number, x2: number, y2: number) {
		if ((x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2)) {
			// Diagonal von links oben nach rechts unten oder umgekehrt
			const qx = Math.min(x1, x2) + Math.abs(x2 - x1) * 0.75;
			const qy = Math.min(y1, y2) + Math.abs(y2 - y1) * 0.25;
			return `M ${x1} ${y1} Q ${qx} ${qy},  ${x2} ${y2}`;
		} else {
			// Diagonal von links unten nach rechts oben oder umgekehrt
			const qx = Math.min(x1, x2) + Math.abs(x2 - x1) * 0.25;
			const qy = Math.min(y1, y2) + Math.abs(y2 - y1) * 0.25;
			return `M ${x1} ${y1} Q ${qx} ${qy},  ${x2} ${y2}`;
		}
	}

	// 1. Zoom per Mausrad
	function handleWheel(e: WheelEvent) {
		// Wheel über Fenstern/Menüs darf nie die Karte zoomen
		if ((e.target as HTMLElement).closest('.window, .list-group, .toast, .popover')) return;

		e.preventDefault();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
		const newZoom = Math.min(Math.max(zoom.value * zoomFactor, MIN_ZOOM), MAX_ZOOM);

		if (newZoom === zoom.value) return;

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const scaleChange = newZoom / zoom.value;
		pan.x = mouseX - (mouseX - pan.x) * scaleChange;
		pan.y = mouseY - (mouseY - pan.y) * scaleChange;

		zoom.value = newZoom;
		updateNodeSpawn();
	}

	// 2. Klick auf den Hintergrund (Karten-Pan starten)
	function handleViewportPointerDown(e: PointerEvent) {
		// Sicherheits-Check: Falls e.stopPropagation am Knoten/UI-Overlay fehlschlägt
		if ((e.target as HTMLElement).closest('.network-node, .list-group, .window, .toast, .popover'))
			return;

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
		} else if (node.type === 'router') {
			// only allow, if a router-interface is free
			const router = node as Router; // TODO: Typisierung für Router
			return router.interfaces.some((i) => {
				return i.dataLinkLayer.cable === undefined;
			});
		} else {
			return false;
		}
	}

	// 3. Klick auf Node (Node-Drag starten)
	function handleNodePointerDown(e: PointerEvent, uuid: string) {
		e.stopPropagation(); // Verhindert Karten-Pan
		updatePointer(e);
		if (e.button !== 0) return; // Nur Linksklick erlauben (sonst wird dies auch beim Kontextmenü ausgeführt)

		if (settings.mode === 'play') {
			// Im Play-Modus keine Dragging-Logik, nur Fenster öffnen
			draggingNodeUuid = uuid;
			handleNodeClick();
			return;
		}

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
			// Kein Dragging, wenn wir gerade ein Kabel hinzufügen (sonst teleportiert der Node per Alt-Drag-State)
			return;
		}

		draggingNodeUuid = uuid;
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
	let mousePointer = $state(false);
	let pointerPosition = $state({ x: 0, y: 0 });

	function screenToWorld(clientX: number, clientY: number) {
		const rect = (
			document.querySelector('.viewport') as HTMLElement | null
		)?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };

		return {
			x: (clientX - rect.left - pan.x) / zoom.value,
			y: (clientY - rect.top - pan.y) / zoom.value
		};
	}

	function updatePointer(e: PointerEvent) {
		mousePointer = e.pointerType === 'mouse';
		if (mousePointer) {
			const worldPos = screenToWorld(e.clientX, e.clientY);
			mouse.x = worldPos.x;
			mouse.y = worldPos.y;
			pointerPosition.x = e.clientX;
			pointerPosition.y = e.clientY;
		}
	}

	let isDraggingNode = $state(false);
	// 4. Globale Bewegung verarbeiten (über <svelte:window>)
	function handleWindowPointerMove(e: PointerEvent) {
		updatePointer(e);

		const dx = e.clientX - startPointer.x;
		const dy = e.clientY - startPointer.y;

		if (isPanning) {
			pan.x = startPan.x + dx;
			pan.y = startPan.y + dy;
			updateNodeSpawn();
		} else if (draggingNodeUuid && settings.mode === 'edit') {
			// Prüfen, ob große Entfernung bewegt wird, oder nur geklickt wird
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
				isDraggingNode = true;
			}

			const node = nodes.find((n) => n.uuid === draggingNodeUuid);
			if (node) {
				// WICHTIG: Distanz durch Zoom teilen!
				node.x = startNodePos.x + dx / zoom.value;
				node.y = startNodePos.y + dy / zoom.value;
			}
		}
	}

	// 5. Drag beenden
	function handleWindowPointerUp(e: PointerEvent) {
		const viewportRect = viewportEl.getBoundingClientRect();
		const isWithinViewport =
			e.clientX >= viewportRect.left &&
			e.clientX <= viewportRect.right &&
			e.clientY >= viewportRect.top &&
			e.clientY <= viewportRect.bottom;
		// Klicks auf Kontextmenüs/Fenster dürfen das Menü nicht vorzeitig schließen (sonst kommt der eigentliche Klick nie an)
		const isOnOverlay = (e.target as HTMLElement).closest('.list-group, .window, .toast, .popover');

		if (isWithinViewport && !isDraggingNode && !newCable.adding && !isOnOverlay) {
			if (draggingNodeUuid) {
				handleNodeClick();
			} else if (e.button === 0) {
				handleViewportClick();
			}
		}

		isPanning = false;
		isDraggingNode = false;
		draggingNodeUuid = null;
	}

	function handleViewportClick() {
		focusedWindowUuid = null;
		if (contextMenuEdit.uuid) {
			closeContextMenu();
			return;
		}
		if (contextMenuPlay.uuid) {
			closeContextMenu();
			return;
		}
		if (settings.mode === 'edit') {
			editNode.uuid = '';
		}
	}

	type Placement = 'top' | 'bottom' | 'start' | 'end';
	const POPOVER_GAP = 10; // Pfeilhöhe (0.5rem) + Abstand
	const ARROW_SIZE = 16; // Pfeilbreite (1rem)
	const NODE_LABEL_HEIGHT = 48; // Name + IP unter dem Icon
	const PLACEMENT_ORDER: Placement[] = ['bottom', 'top', 'end', 'start'];

	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	let popoverWidth = $state(0);
	let popoverHeight = $state(0);

	// Node in Viewport-Pixeln (Pan/Zoom); das Popover selbst bleibt unskaliert
	let popoverLayout = $derived.by(() => {
		const node = nodes.find((n) => n.uuid === editNode.uuid);
		if (!node) return null;

		const z = zoom.value;
		const x = node.x * z + pan.x;
		const y = node.y * z + pan.y;
		const size = 64 * z;
		const cx = x + size / 2;
		const cy = y + size / 2;
		const w = popoverWidth;
		const h = popoverHeight;
		const bottomEdge = y + size + NODE_LABEL_HEIGHT * z;

		const space: Record<Placement, number> = {
			bottom: viewportHeight - bottomEdge - POPOVER_GAP - h,
			top: y - POPOVER_GAP - h,
			end: viewportWidth - (x + size) - POPOVER_GAP - w,
			start: x - POPOVER_GAP - w
		};
		const placement =
			PLACEMENT_ORDER.find((p) => space[p] >= 0) ??
			PLACEMENT_ORDER.reduce((best, p) => (space[p] > space[best] ? p : best));

		const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
		let left: number;
		let top: number;
		let arrow: number;
		if (placement === 'top' || placement === 'bottom') {
			left = clamp(cx - w / 2, viewportWidth - w);
			top = placement === 'top' ? y - POPOVER_GAP - h : bottomEdge + POPOVER_GAP;
			arrow = Math.max(ARROW_SIZE / 2, Math.min(cx - left - ARROW_SIZE / 2, w - ARROW_SIZE * 1.5));
		} else {
			top = clamp(cy - h / 2, viewportHeight - h);
			left = placement === 'start' ? x - POPOVER_GAP - w : x + size + POPOVER_GAP;
			arrow = Math.max(ARROW_SIZE / 2, Math.min(cy - top - ARROW_SIZE / 2, h - ARROW_SIZE * 1.5));
		}
		return { placement, left, top, arrow };
	});

	let popoverPosition = $state({ x: 0, y: 0 });
	function handleNodeClick() {
		// Zum Öffnen der Node-Settings
		if (settings.mode === 'edit' && draggingNodeUuid) {
			// Hole Position von dem Node, um das Popover dort zu platzieren
			const node = nodes.find((n) => n.uuid === draggingNodeUuid);
			if (!node) return;
			popoverPosition.x = node.x;
			popoverPosition.y = node.y;
			editNode.uuid = draggingNodeUuid;
		}

		// Zum Öffnen des Fensters im Play-Modus
		if (settings.mode === 'play' && draggingNodeUuid) {
			const node = nodes.find((n) => n.uuid === draggingNodeUuid);

			// beim Router gibts nichts zu öffnen
			if (!node || (node && node.type === 'router')) {
				return;
			}

			// Prüfen, ob das Fenster bereits geöffnet ist
			const existingWindow = windows.find((w) => w.nodeUuid === node.uuid && w.isSniffer === false);
			if (existingWindow) {
				// Fenster in den Vordergrund bringen
				focusWindow(node.uuid);
			} else {
				// Neues Fenster öffnen
				windows.push({
					nodeUuid: node.uuid,
					isSniffer: false,
					x: 100,
					y: 100,
					width: 500,
					height: 400,
					open: true,
					zIndex: ++windowsMaxZIndex
				});
				focusedWindowUuid = node.uuid;
			}
		}
	}

	function focusWindow(nodeUuid: string) {
		const win = windows.find((w) => w.nodeUuid === nodeUuid);
		if (win) {
			win.open = true;
			if (win.sniffedNode) {
				// Sniffer-Fenster: Fokus auf das Sniffer-Fenster, nicht auf den gesniffeten Node
				focusedWindowUuid = win.sniffedNode;
			} else {
				focusedWindowUuid = nodeUuid;
			}

			if (win.zIndex !== windowsMaxZIndex) {
				windowsMaxZIndex++;
				win.zIndex = windowsMaxZIndex;
			}
		}
	}

	function closeWindow(nodeUuid: string) {
		const win = windows.find((w) => w.nodeUuid === nodeUuid);
		if (win) {
			win.open = false;
			if (focusedWindowUuid === nodeUuid) focusedWindowUuid = null;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (newCable.adding) {
				newCable.adding = false;
				newCable.uuids = [];
			} else if (contextMenuEdit.uuid) {
				closeContextMenu();
			} else if (editNode.uuid) {
				editNode.uuid = '';
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
			case 'router':
				return router;
			default:
				return '';
		}
	}

	let contextMenuEdit = $state<{ x: number; y: number; uuid: string }>({ x: 0, y: 0, uuid: '' });
	let contextMenuPlay = $state<{ x: number; y: number; uuid: string }>({ x: 0, y: 0, uuid: '' });
	function handleContextMenuNode(e: MouseEvent, nodeUuid: string) {
		e.preventDefault();
		e.stopPropagation();
		contextMenuEdit.uuid = nodeUuid;
		contextMenuPlay.uuid = nodeUuid;
		contextMenuEdit.x = e.clientX;
		contextMenuEdit.y = e.clientY;
		contextMenuPlay.x = e.clientX;
		contextMenuPlay.y = e.clientY;
	}

	function closeContextMenu() {
		contextMenuEdit.uuid = '';
		contextMenuPlay.uuid = '';
	}

	function handleWindowClick(event: MouseEvent) {
		if (!(event.target as HTMLElement).closest('.toast')) closeContextMenu();
	}

	function openSniffer() {
		const existingWindow = windows.find(
			(w) => w.nodeUuid === nodeToSniff.dataLinkLayerUuid && w.isSniffer === true
		);
		if (existingWindow) {
			focusWindow(nodeToSniff.dataLinkLayerUuid);
		} else {
			let n = nodes.find((n) => n.uuid === nodeToSniff.nodeUuid)!;

			windows.push({
				nodeUuid: nodeToSniff.dataLinkLayerUuid,
				isSniffer: true,
				sniffedNode: n.uuid,
				x: 150,
				y: 150,
				width: 700,
				height: 400,
				open: true,
				zIndex: ++windowsMaxZIndex
			});
			focusedWindowUuid = nodeToSniff.dataLinkLayerUuid;
		}
	}

	function onContextMenuCanvas(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		// stop adding cable if right click on canvas
		if (newCable.adding) {
			newCable.adding = false;
			newCable.uuids = [];
		}
	}
</script>

<!-- Globale Event-Listener garantieren, dass Dragging nicht abbricht wenn man schnell zieht -->
<svelte:window
	onpointerdown={updatePointer}
	onpointermove={handleWindowPointerMove}
	onpointerup={handleWindowPointerUp}
	onkeydown={handleKeyDown}
	onclick={handleWindowClick}
/>

<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
	<defs>
		<filter id="outline">
			<!-- 1. Bildbereich vergrößern/aufblähen -->
			<feMorphology in="SourceAlpha" result="expanded" operator="dilate" radius="3" />
			<!-- 2. Farbe der Umrandung festlegen -->
			<feFlood flood-color="#2ac759" result="color" />
			<feComposite in="color" in2="expanded" operator="in" result="outline" />
			<!-- 3. Originalbild über die Umrandung legen -->
			<feMerge>
				<feMergeNode in="outline" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>
	</defs>
</svg>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={viewportEl}
	bind:clientWidth={viewportWidth}
	bind:clientHeight={viewportHeight}
	class="viewport"
	class:panning={isPanning}
	style="background-size: {24 * zoom.value}px {24 *
		zoom.value}px; background-position: {pan.x}px {pan.y}px; background-image: radial-gradient({settings.lightMode ===
	'light'
		? '#999999'
		: '#353749'} {1 * zoom.value}px, transparent {1 * zoom.value}px);"
	onwheel={handleWheel}
	onpointerdown={handleViewportPointerDown}
>
	<button class="zoom-indicator" onclick={() => (zoom.value = 1)}
		>{Math.round(zoom.value * 100)}%</button
	>

	<div
		class="world"
		style="transform: translate({pan.x}px, {pan.y}px) scale({zoom.value}); "
		oncontextmenu={onContextMenuCanvas}
	>
		<svg class="svg-layer">
			{#each cables as c (c.cableuuid)}
				{@const start = getNodeCenter(c.from)}
				{@const end = getNodeCenter(c.to)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<g
					class="path-group"
					onclick={() => {
						if (settings.mode === 'edit') {
							removeCable(c.cableuuid);
						}
					}}
				>
					<path class="hitbox" d={getCablePath(start.x, start.y, end.x, end.y)} />
					<path
						class:transmitting={c.cable.isTransmitting}
						style="stroke: {c.cable.transmissionColor};"
						class:highlight={c.cable.uuid === highlightedCable.uuid}
						class:cableEdit={settings.mode === 'edit' && !newCable.adding}
						d={getCablePath(start.x, start.y, end.x, end.y)}
						class="cable"
					/>
				</g>
				<circle
					r="8"
					fill={c.cable.transmissionColor}
					style="--path: path('{getCablePath(
						start.x,
						start.y,
						end.x,
						end.y
					)}'); --duration: {c.cable.getTransmissionDelay()}ms;"
					class="moving-dot"
					class:fromB={c.cable.isTransmittingFromA === false}
					class:active={c.cable.isTransmitting}
				/>
			{/each}
			{#if newCable.adding && mousePointer && newCable.uuids.length === 1}
				{@const start = getNodeCenter(newCable.uuids[0])}
				{@const end = { x: mouse.x, y: mouse.y }}
				<path
					d={getCablePath(start.x, start.y, end.x, end.y)}
					class="cable"
					style="stroke: #89b4fa;"
				/>
			{/if}
		</svg>

		{#each nodes as node (node.uuid)}
			<div
				in:scale={{
					duration: 200,
					start: 1.3
				}}
				out:scale={{
					duration: 200,
					start: 0.5
				}}
				class="network-node"
				class:cable-selected={newCable.adding && !mousePointer && newCable.uuids[0] === node.uuid}
				style="left: {node.x}px; top: {node.y}px; width: 64px; height: 64px;"
				onpointerdown={(e) => handleNodePointerDown(e, node.uuid)}
				oncontextmenu={(e) => {
					handleContextMenuNode(e, node.uuid);
				}}
			>
				{#if node.type === 'notebook' || node.type === 'desktop'}
					<div class="host-services">
						<ServersOnHost host={node as Host} />
					</div>
				{/if}
				<img
					src={getImageForNodeType(node.type)}
					alt={node.type}
					width="64"
					height="64"
					draggable={false}
					style:filter={node.uuid === editNode.uuid || node.uuid === focusedWindowUuid
						? 'url(#outline)'
						: ''}
				/>
				<div>
					{node.name}
				</div>
				{#if node.type === 'notebook' || node.type === 'desktop'}
					<div>
						{(node as Host).config.ipAddress}
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if editNode.uuid && settings.mode === 'edit' && popoverLayout}
		<div
			transition:fade={{ duration: 100 }}
			class="popover bs-popover-{popoverLayout.placement} show shadow"
			style="width: max-content; position: absolute; left: {popoverLayout.left}px; top: {popoverLayout.top}px;"
			bind:offsetWidth={popoverWidth}
			bind:offsetHeight={popoverHeight}
		>
			<div
				class="popover-arrow"
				style="position: absolute; {popoverLayout.placement === 'top' ||
				popoverLayout.placement === 'bottom'
					? 'left'
					: 'top'}: {popoverLayout.arrow}px;"
			></div>
			<div class="popover-body">
				<NodeSettings />
			</div>
		</div>
	{/if}
	{#if settings.mode === 'edit' && contextMenuEdit.uuid !== ''}
		<ContextMenuEdit uuid={contextMenuEdit.uuid} x={contextMenuEdit.x} y={contextMenuEdit.y} />
	{/if}
	{#if settings.mode === 'play' && contextMenuPlay.uuid !== ''}
		<ContextMenuPlay
			onOpenSniffer={openSniffer}
			uuid={contextMenuPlay.uuid}
			x={contextMenuPlay.x}
			y={contextMenuPlay.y}
		/>
	{/if}

	{#if newCable.adding && mousePointer}
		<div class="cable-tooltip" style:left="{pointerPosition.x}px" style:top="{pointerPosition.y}px">
			<img src={cable} alt="Cable" width="40" height="40" />
			<span>{newCable.uuids.length + 1}</span>
		</div>
	{:else if newCable.adding}
		<div class="cable-instruction" role="status">
			{newCable.uuids.length === 0 ? 'Ersten Knoten auswählen' : 'Zweiten Knoten auswählen'}
		</div>
	{/if}

	{#each visibleWindows as win (win.nodeUuid)}
		<Window
			nodeUuid={win.nodeUuid}
			isSniffer={win.isSniffer}
			sniffedNode={win.sniffedNode}
			bind:x={win.x}
			bind:y={win.y}
			bind:width={win.width}
			bind:height={win.height}
			zIndex={win.zIndex}
			onFocus={() => focusWindow(win.nodeUuid)}
			onClose={() => closeWindow(win.nodeUuid)}
		/>
	{/each}
	<PacketNotices />
</div>

<style>
	.popover {
		backdrop-filter: blur(4px);
		background-color: rgba(24, 24, 27, 0.8);
		border-color: #45475a83;
		max-width: inherit !important;
		max-height: 100%;
		overflow-y: auto;
	}

	.host-services {
		position: absolute;
		top: 0;
		right: 0;
		pointer-events: none;
		z-index: 10;
	}

	.moving-dot {
		offset-path: var(--path);
	}

	.moving-dot.active:not(.fromB) {
		animation: move var(--duration) linear infinite;
	}

	.moving-dot.active.fromB {
		animation: moveBack var(--duration) linear infinite;
	}

	@keyframes move {
		from {
			offset-distance: 0%;
		}
		to {
			offset-distance: 100%;
		}
	}

	@keyframes moveBack {
		from {
			offset-distance: 100%;
		}
		to {
			offset-distance: 0%;
		}
	}

	.cable-tooltip {
		position: fixed;
		color: #cdd6f4;
		margin: 6px 12px;
		font-size: 12px;
		font-weight: bold;
		z-index: 10;
		pointer-events: none;
	}

	.cable-instruction {
		position: absolute;
		right: 16px;
		bottom: 16px;
		max-width: calc(100% - 112px);
		padding: 6px 12px;
		border: 1px solid #45475a;
		border-radius: 6px;
		background: #313244;
		color: #cdd6f4;
		font-size: 12px;
		font-weight: bold;
		pointer-events: none;
		z-index: 10;
	}

	.cable-tooltip span {
		display: inline-flex;
		justify-content: center;
		align-items: center;
		position: absolute;
		top: 32px;
		left: 32px;
		font-size: 16px;
		color: black;
		font-weight: bold;
		background: rgba(255, 255, 255, 0.575);
		width: 1.5rem;
		aspect-ratio: 1;
		border-radius: 50%;
	}

	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		background-color: #161622;
		overflow: hidden;
		user-select: none;
		cursor: grab;
		/* ESSENZIELL: Verhindert, dass der Browser Gesten abfängt */
		touch-action: none;
	}

	:global([data-bs-theme='light'] .viewport) {
		background-color: #fff;
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

	.hitbox {
		fill: none;
		stroke: transparent;
		stroke-width: 20px;
		pointer-events: stroke;
	}

	.path-group:has(.cableEdit) {
		cursor:
			url('../../assets/scissors.svg') 14 14,
			pointer;
	}

	.cable {
		stroke-width: 3px;
		fill: none;
		pointer-events: none;
		cursor: pointer;
	}

	.path-group:hover .cableEdit {
		stroke: #f38ba8 !important;
		stroke-width: 5px;
		stroke-dasharray: 10, 15;
	}

	.cable.transmitting {
		stroke-width: 4px;
	}

	.cable.highlight {
		stroke: #2ac759 !important;
		stroke-width: 5px;
		animation: highlight-pulse 0.6s ease-out 1;
	}

	@keyframes highlight-pulse {
		0% {
			stroke-width: 3px;
		}
		40% {
			stroke-width: 14px;
		}
		100% {
			stroke-width: 5px;
		}
	}

	.network-node {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 8px;
		border: 2px solid transparent;
		color: #cdd6f4;
		/* ESSENZIELL: Verhindert Text-Selection & Touch-Gesten */
		touch-action: none;
	}

	:global([data-bs-theme='light'] .network-node) {
		color: #353535 !important;
	}

	.network-node:hover {
		cursor: pointer;
	}

	.network-node.cable-selected {
		border-color: #89b4fa;
		box-shadow: 0 0 0 3px #313244;
	}

	.network-node:active {
		cursor: grabbing !important;
	}
</style>
