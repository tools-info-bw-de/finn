<script lang="ts">
	import { untrack } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { keymap } from '@codemirror/view';
	import type { Extension } from '@codemirror/state';
	import { indentWithTab } from '@codemirror/commands';
	import { html } from '@codemirror/lang-html';
	import { css } from '@codemirror/lang-css';
	import { javascript } from '@codemirror/lang-javascript';
	import { oneDark } from '@codemirror/theme-one-dark';

	// Der Inhalt wird nur beim Erzeugen übernommen. Für einen neuen Inhalt (andere Datei,
	// Verwerfen, Theme-Wechsel) erzeugt der Aufrufer die Komponente per {#key} neu.
	let {
		path,
		doc,
		dark,
		onchange,
		onsave
	}: {
		path: string;
		doc: string;
		dark: boolean;
		onchange: (text: string) => void;
		onsave: () => void;
	} = $props();

	// Sprache (Hervorhebung + Autovervollständigung) anhand der Dateiendung.
	// html() enthält auch CSS- und JS-Unterstützung für eingebettete style- und script-Blöcke.
	function languageFor(file: string): Extension[] {
		const ext = file.split('.').pop()?.toLowerCase();
		if (ext === 'html' || ext === 'htm') return [html()];
		if (ext === 'css') return [css()];
		if (ext === 'js' || ext === 'mjs' || ext === 'json') return [javascript()];
		return [];
	}

	const sizing = EditorView.theme({
		'&': { height: '100%', fontSize: '0.85rem' },
		'.cm-scroller': { overflow: 'auto' },
		// Das umgebende Fenster setzt cursor: default -> im Textbereich wieder den Textcursor zeigen
		'.cm-content': { cursor: 'text' }
	});

	function mount(node: HTMLElement) {
		const view = untrack(
			() =>
				new EditorView({
					parent: node,
					doc,
					extensions: [
						keymap.of([
							{
								key: 'Mod-s',
								preventDefault: true,
								run: () => {
									onsave();
									return true;
								}
							},
							indentWithTab
						]),
						basicSetup,
						languageFor(path),
						sizing,
						dark ? oneDark : [],
						EditorView.updateListener.of((update) => {
							if (update.docChanged) onchange(update.state.doc.toString());
						})
					]
				})
		);
		return () => view.destroy();
	}
</script>

<div class="code-editor" {@attach mount}></div>

<style>
	.code-editor {
		height: 100%;
		min-height: 0;
		/* Das Fenster verbietet Textauswahl (user-select: none) -> hier wieder erlauben */
		user-select: text;
	}
</style>
