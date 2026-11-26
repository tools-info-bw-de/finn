<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import { FileSystem, bytesToBase64 } from '$lib/engine/FileSystem.svelte';
	import { CONTENT_TYPES, WEB_ROOT } from '$lib/engine/http';
	import { settings } from '$lib/states/settings.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import CodeEditor from './CodeEditor.svelte';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const editor = host.editorState();

	// Im Dateibaum angezeigtes Verzeichnis (per "nach oben" bzw. Kontextmenü änderbar)
	let root = $derived(editor.root ?? WEB_ROOT);

	type TreeNode = { name: string; path: string; dir: boolean; children: TreeNode[] };

	function buildTree(dir: string): TreeNode[] {
		const fs = host.fileSystem;
		const nodes: TreeNode[] = [];
		for (const path of fs.directories.keys()) {
			if (path !== dir && FileSystem.dirname(path) === dir) {
				nodes.push({ name: basename(path), path, dir: true, children: buildTree(path) });
			}
		}
		for (const path of fs.files.keys()) {
			if (FileSystem.dirname(path) === dir) {
				nodes.push({ name: basename(path), path, dir: false, children: [] });
			}
		}
		// Verzeichnisse zuerst, dann alphabetisch
		return nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
	}

	function basename(path: string): string {
		return path.slice(path.lastIndexOf('/') + 1);
	}

	function extension(path: string): string {
		const name = basename(path);
		const dot = name.lastIndexOf('.');
		return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
	}

	let tree = $derived(buildTree(root));
	let collapsed = new SvelteSet<string>();

	// Inhalt der geöffneten Datei (undefined = keine Datei bzw. Datei gelöscht)
	let content = $derived(editor.path ? host.fileSystem.readFile(editor.path) : undefined);
	let imageMime = $derived.by(() => {
		if (!editor.path) return undefined;
		const mime = CONTENT_TYPES[extension(editor.path)];
		return mime?.startsWith('image/') ? mime : undefined;
	});
	let dirty = $derived(editor.draft !== null);

	// Zähler, um den CodeMirror-Editor nach "Verwerfen" mit dem gespeicherten Inhalt neu aufzubauen
	let revision = $state(0);
	// Datei, die nach Rückfrage (ungespeicherte Änderungen) geöffnet werden soll
	let pendingPath = $state<string | null>(null);

	let appEl = $state<HTMLDivElement | null>(null);

	// Kontextmenü (Rechtsklick im Dateibaum), Position relativ zur App
	let menu = $state<{ x: number; y: number; path: string; dir: boolean } | null>(null);

	// Aktion, die unten in der Seitenleiste bestätigt wird
	type ActionKind = 'new-file' | 'new-folder' | 'move' | 'delete';
	let action = $state<{ kind: ActionKind; path: string; dir: boolean } | null>(null);
	let actionValue = $state('');
	let actionError = $state('');

	function requestOpen(path: string) {
		if (path === editor.path) return;
		if (dirty) {
			pendingPath = path;
			return;
		}
		open(path);
	}

	function open(path: string) {
		editor.path = path;
		editor.draft = null;
		pendingPath = null;
	}

	function handleChange(text: string) {
		editor.draft = text === content ? null : text;
	}

	function save() {
		if (!editor.path || editor.draft === null) return;
		host.fileSystem.writeFile(editor.path, editor.draft);
		editor.draft = null;
	}

	function discard() {
		editor.draft = null;
		revision++;
	}

	function resolvePending(action: 'save' | 'discard' | 'cancel') {
		const target = pendingPath;
		pendingPath = null;
		if (action === 'cancel' || target === null) return;
		if (action === 'save') save();
		open(target);
	}

	function openMenu(event: MouseEvent, path: string, dir: boolean) {
		event.preventDefault();
		event.stopPropagation();
		const rect = appEl?.getBoundingClientRect();
		if (!rect) return;
		menu = { x: event.clientX - rect.left, y: event.clientY - rect.top, path, dir };
	}

	function closeMenu(event: Event) {
		if (menu && !(event.target as Element | null)?.closest?.('.context-menu')) menu = null;
	}

	function startAction(kind: ActionKind) {
		if (!menu) return;
		action = { kind, path: menu.path, dir: menu.dir };
		actionValue = kind === 'move' ? menu.path : '';
		actionError = '';
		menu = null;
	}

	function cancelAction() {
		action = null;
		actionError = '';
	}

	function setRoot(dir: string) {
		editor.root = dir;
		menu = null;
	}

	// Eingabe relativ zum Verzeichnis "base" auflösen (absolute Pfade bleiben, wie sie sind)
	function resolveInput(value: string, base: string): string {
		return value.startsWith('/') ? FileSystem.normalize(value) : FileSystem.join(base, value);
	}

	// Pfad anpassen, nachdem "from" nach "to" verschoben wurde (auch für Inhalte eines Verzeichnisses)
	function remap(path: string, from: string, to: string): string {
		if (path === from) return to;
		return path.startsWith(from + '/') ? to + path.slice(from.length) : path;
	}

	function isInside(path: string | null, dir: string): boolean {
		return path !== null && (path === dir || path.startsWith(dir + '/'));
	}

	function submitAction(event: SubmitEvent) {
		event.preventDefault();
		if (!action) return;
		const fs = host.fileSystem;
		const { kind, path } = action;
		const value = actionValue.trim();
		actionError = '';

		if (kind === 'delete') {
			if (action.dir) fs.deleteDirectory(path);
			else fs.deleteFile(path);
			if (isInside(editor.path, path)) {
				editor.path = null;
				editor.draft = null;
			}
			if (isInside(pendingPath, path)) pendingPath = null;
			if (isInside(root, path)) editor.root = FileSystem.dirname(path);
			action = null;
			return;
		}

		if (value === '' || value.endsWith('/')) {
			actionError = 'Bitte einen Namen angeben.';
			return;
		}

		if (kind === 'move') {
			const target = resolveInput(value, FileSystem.dirname(path));
			try {
				fs.move(path, target);
			} catch (error) {
				actionError = error instanceof Error ? error.message : String(error);
				return;
			}
			if (editor.path) editor.path = remap(editor.path, path, target);
			if (pendingPath) pendingPath = remap(pendingPath, path, target);
			if (isInside(root, path)) editor.root = remap(root, path, target);
			action = null;
			return;
		}

		const target = resolveInput(value, path);
		if (fs.isFile(target) || fs.isDirectory(target)) {
			actionError = `${target} existiert bereits.`;
			return;
		}
		if (fs.isFile(FileSystem.dirname(target))) {
			actionError = `${FileSystem.dirname(target)} ist eine Datei und kein Verzeichnis.`;
			return;
		}
		collapsed.delete(path);
		if (kind === 'new-folder') {
			fs.mkdir(target);
		} else {
			fs.writeFile(target, '');
			requestOpen(target);
		}
		action = null;
	}

	// Eingabefeld der Aktion fokussieren; beim Umbenennen nur den Dateinamen markieren
	function focusInput(node: HTMLInputElement) {
		node.focus();
		const slash = node.value.lastIndexOf('/');
		const dot = node.value.lastIndexOf('.');
		node.setSelectionRange(slash + 1, dot > slash + 1 ? dot : node.value.length);
	}

	function toggle(path: string) {
		if (collapsed.has(path)) collapsed.delete(path);
		else collapsed.add(path);
	}
</script>

{#snippet treeNodes(nodes: TreeNode[], depth: number)}
	{#each nodes as node (node.path)}
		<button
			class="tree-item"
			class:active={node.path === editor.path}
			style="padding-left: {0.4 + depth * 0.9}rem;"
			title={node.path}
			onclick={() => (node.dir ? toggle(node.path) : requestOpen(node.path))}
			oncontextmenu={(event) => openMenu(event, node.path, node.dir)}
		>
			{#if node.dir}
				<span class="tree-icon">{collapsed.has(node.path) ? '▸' : '▾'}</span>📁
			{:else}
				<span class="tree-icon"></span>📄
			{/if}
			{node.name}
		</button>
		{#if node.dir && !collapsed.has(node.path)}
			{@render treeNodes(node.children, depth + 1)}
		{/if}
	{/each}
{/snippet}

<svelte:window
	onpointerdown={closeMenu}
	onkeydown={(event) => {
		if (event.key === 'Escape') menu = null;
	}}
/>

<div class="background flex-fill d-flex flex-row editor-app" bind:this={appEl}>
	<aside class="sidebar d-flex flex-column">
		<div class="tree-root d-flex flex-row align-items-center gap-1">
			<button
				class="up-btn"
				title="Übergeordnetes Verzeichnis"
				aria-label="Übergeordnetes Verzeichnis"
				disabled={root === '/'}
				onclick={() => setRoot(FileSystem.dirname(root))}>⬆</button
			>
			<span class="text-truncate" title={root}>{root}</span>
		</div>
		<div
			class="tree flex-fill"
			role="tree"
			tabindex="-1"
			oncontextmenu={(event) => openMenu(event, root, true)}
		>
			{@render treeNodes(tree, 0)}
		</div>
		{#if action}
			<form class="action p-1" onsubmit={submitAction}>
				<div class="small mb-1 text-break">
					{#if action.kind === 'new-file'}
						Neue Datei in {action.path}:
					{:else if action.kind === 'new-folder'}
						Neuer Ordner in {action.path}:
					{:else if action.kind === 'move'}
						Neuer Pfad für {basename(action.path)}:
					{:else}
						{action.path}{action.dir ? ' samt Inhalt' : ''} löschen?
					{/if}
				</div>
				{#if action.kind !== 'delete'}
					<input
						type="text"
						class="form-control form-control-sm mb-1"
						aria-label="Name"
						spellcheck="false"
						autocomplete="off"
						placeholder={action.kind === 'new-folder' ? 'ordner' : 'neu.html'}
						bind:value={actionValue}
						{@attach focusInput}
					/>
				{/if}
				{#if actionError}
					<div class="small text-danger mb-1">{actionError}</div>
				{/if}
				<div class="d-flex flex-row gap-1">
					<button
						class="btn btn-sm {action.kind === 'delete' ? 'btn-danger' : 'btn-primary'}"
						type="submit"
					>
						{action.kind === 'delete' ? 'Löschen' : 'OK'}
					</button>
					<button class="btn btn-sm btn-outline-secondary" type="button" onclick={cancelAction}>
						Abbrechen
					</button>
				</div>
			</form>
		{/if}
	</aside>

	<main class="flex-fill d-flex flex-column">
		{#if editor.path}
			<div class="toolbar d-flex flex-row align-items-center gap-2 px-2">
				<span class="file-path text-truncate" title={editor.path}>
					{editor.path}{#if dirty}<span class="dirty" title="Ungespeicherte Änderungen">
							●</span
						>{/if}
				</span>
				{#if typeof content === 'string'}
					<button
						class="btn btn-sm btn-outline-secondary ms-auto"
						disabled={!dirty}
						onclick={discard}
					>
						Verwerfen
					</button>
					<button
						class="btn btn-sm btn-primary"
						disabled={!dirty}
						onclick={save}
						title="Speichern (Strg+S)"
					>
						Speichern
					</button>
				{/if}
			</div>
		{/if}

		{#if pendingPath}
			<div class="pending d-flex flex-row flex-wrap align-items-center gap-2 px-2 py-1">
				<span class="me-auto">Ungespeicherte Änderungen an {basename(editor.path ?? '')}</span>
				<button class="btn btn-sm btn-primary" onclick={() => resolvePending('save')}>
					Speichern
				</button>
				<button class="btn btn-sm btn-outline-danger" onclick={() => resolvePending('discard')}>
					Verwerfen
				</button>
				<button class="btn btn-sm btn-outline-secondary" onclick={() => resolvePending('cancel')}>
					Abbrechen
				</button>
			</div>
		{/if}

		<div class="content flex-fill">
			{#if !editor.path}
				<div class="hint">Links eine Datei zum Öffnen auswählen.</div>
			{:else if content === undefined}
				<div class="hint">Die Datei {editor.path} existiert nicht mehr.</div>
			{:else if imageMime && content instanceof Uint8Array}
				<div class="image-view">
					<img
						src="data:{imageMime};base64,{bytesToBase64(content)}"
						alt={basename(editor.path)}
						draggable="false"
					/>
				</div>
			{:else if typeof content === 'string'}
				{#key `${editor.path}|${settings.theme}|${revision}`}
					<CodeEditor
						path={editor.path}
						doc={editor.draft ?? content}
						dark={settings.theme === 'dark'}
						onchange={handleChange}
						onsave={save}
					/>
				{/key}
			{:else}
				<div class="hint">Binärdatei – kann nicht angezeigt werden.</div>
			{/if}
		</div>
	</main>

	{#if menu}
		<ul class="context-menu dropdown-menu show" style="left: {menu.x}px; top: {menu.y}px;">
			{#if menu.dir}
				<li>
					<button class="dropdown-item" onclick={() => startAction('new-file')}>Neue Datei</button>
				</li>
				<li>
					<button class="dropdown-item" onclick={() => startAction('new-folder')}
						>Neuer Ordner</button
					>
				</li>
				{#if menu.path !== root}
					<li>
						<button class="dropdown-item" onclick={() => setRoot(menu!.path)}
							>Als Wurzel anzeigen</button
						>
					</li>
				{/if}
				{#if menu.path !== '/'}
					<li><hr class="dropdown-divider" /></li>
				{/if}
			{/if}
			{#if menu.path !== '/'}
				<li>
					<button class="dropdown-item" onclick={() => startAction('move')}>
						Umbenennen / Verschieben
					</button>
				</li>
				<li>
					<button class="dropdown-item text-danger" onclick={() => startAction('delete')}
						>Löschen</button
					>
				</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.editor-app {
		position: relative;
		min-height: 0;
		background-color: var(--bs-body-bg);
	}

	.sidebar {
		width: 200px;
		flex: none;
		min-height: 0;
		border-right: 1px solid #45475a;
		font-size: 0.85rem;
	}

	.tree-root {
		padding: 0.2rem 0.4rem;
		font-weight: bold;
		border-bottom: 1px solid #45475a;
	}

	.tree {
		min-height: 0;
		overflow: auto;
	}

	.tree-item {
		display: block;
		width: 100%;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border: none;
		background: transparent;
		color: inherit;
		padding-top: 0.1rem;
		padding-bottom: 0.1rem;
		padding-right: 0.4rem;
	}

	.tree-item:hover {
		background-color: #89b4fa33;
	}

	.tree-item.active {
		background-color: #89b4fa66;
	}

	.tree-icon {
		display: inline-block;
		width: 0.8rem;
	}

	.up-btn {
		border: none;
		background: transparent;
		color: inherit;
		padding: 0 0.2rem;
	}

	.up-btn:disabled {
		opacity: 0.3;
	}

	.action {
		border-top: 1px solid #45475a;
	}

	.context-menu {
		background-color: #24242494;
		backdrop-filter: blur(5px);
		position: absolute;
		z-index: 10;
		font-size: 0.85rem;
		min-width: 10rem;
	}

	:global([data-bs-theme='light']) .context-menu {
		background-color: #f0f0f05e;
	}

	.context-menu .dropdown-item {
		padding: 0.2rem 0.8rem;
	}

	main {
		min-width: 0;
		min-height: 0;
	}

	.toolbar {
		min-height: 2.2rem;
		border-bottom: 1px solid #45475a;
		font-size: 0.85rem;
	}

	.file-path {
		font-family: monospace;
	}

	.dirty {
		color: #fe5d3a;
	}

	.pending {
		font-size: 0.85rem;
		background-color: #fe5d3a33;
	}

	.content {
		min-height: 0;
		position: relative;
	}

	.hint {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6c757d;
		padding: 1rem;
		text-align: center;
	}

	.image-view {
		height: 100%;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
	}

	.image-view img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
	}
</style>
