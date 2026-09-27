<script lang="ts">
	import { onMount } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import { commandRegistry } from './Terminal/commands';
	import { Host } from '$lib/engine/Host.svelte';
	import '@xterm/xterm/css/xterm.css';

	let { host }: { host: Host } = $props();

	let history = $state<string[]>([]); // Befehlshistorie (chronologisch)
	let historyIndex = $state<number>(-1); // -1 = Aktueller Entwurf, >= 0 = Index in history
	let draftInput = $state<string>(''); // Zwischenspeicher für nicht abgesendeten Text

	let containerEl: HTMLDivElement;
	let term: Terminal;
	let fitAddon: FitAddon;
	let inputBuffer = '';
	let activeController: AbortController | null = null;

	function prompt(): string {
		return `\x1b[1;32m${host.name}\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
	}

	/**
	 * Ersetzt die aktuelle Zeile im Terminal-Display durch einen neuen Text.
	 */
	function replaceLine(newText: string): void {
		if (!term) return;

		// Aktuelle Zeichen im Terminal via Backspace löschen
		const backspaces = '\b \b'.repeat(inputBuffer.length);
		term.write(backspaces);

		// Neuen Text schreiben und Buffer aktualisieren
		term.write(newText);
		inputBuffer = newText;
	}

	onMount(() => {
		term = new Terminal({
			theme: { background: '#181825', foreground: '#cdd6f4', cursor: '#f5e0dc' },
			fontFamily: 'Consolas, monospace',
			fontSize: 13,
			cursorBlink: true
		});

		fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(containerEl);
		fitAddon.fit();

		term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
			// Capture Ctrl+L to clear the terminal
			if (e.key === 'l' && e.ctrlKey) {
				e.preventDefault();
			}

			return true; // Allow other keys to be processed normally
		});

		// Startmeldung & Begrüßung
		term.writeln(`Willkommen auf \x1b[1m${host.name}\x1b[0m (${host.config.ipAddress})`);
		term.writeln('Verfügbare Befehle: ' + Object.keys(commandRegistry).join(', ') + ', clear\r\n');
		term.write(prompt());

		term.onData(async (data) => {
			// Strg + C (Laufenden Befehl abbrechen)
			if (data === '\x03') {
				if (activeController) {
					activeController.abort();
					activeController = null;
				} else {
					term.writeln('^C');
					inputBuffer = '';
					term.write(prompt());
				}
				return;
			}

			// Pfeil hoch
			if (data === '\x1b[A') {
				if (historyIndex < history.length - 1) {
					if (historyIndex === -1) {
						draftInput = inputBuffer; // Zwischenspeichern des aktuellen Entwurfs
					}
					historyIndex++;
					replaceLine(history[history.length - 1 - historyIndex]);
				}
				return;
			}

			// Pfeil runter
			if (data === '\x1b[B') {
				if (historyIndex > -1) {
					historyIndex--;
					if (historyIndex === -1) {
						replaceLine(draftInput);
					} else {
						replaceLine(history[history.length - 1 - historyIndex]);
					}
				}
				return;
			}

			// Ctrl+U (Zeile löschen)
			if (data === '\x15') {
				inputBuffer = '';
				term.write('\x1b[2K\r'); // Löscht die aktuelle Zeile und setzt den Cursor an den Anfang
				term.write(prompt());
				historyIndex = -1; // Reset history index
				return;
			}

			// Ctrl+L (Alles löschen)
			if (data === '\x0c') {
				term.clear();
				inputBuffer = '';
				term.write('\x1b[2K\r'); // Löscht die aktuelle Zeile und setzt den Cursor an den Anfang
				term.write(prompt());
				historyIndex = -1; // Reset history index
				return;
			}

			// Enter (Befehl absenden)
			if (data === '\r') {
				term.writeln('');
				const trimmed = inputBuffer.trim();
				inputBuffer = '';

				if (trimmed.length > 0) {
					history.push(trimmed);
				}
				historyIndex = -1; // Reset history index

				if (trimmed.length > 0) {
					await dispatchCommand(trimmed);
				} else {
					term.write(prompt());
				}
				return;
			}

			// Backspace
			if (data === '\x7f') {
				if (inputBuffer.length > 0) {
					inputBuffer = inputBuffer.slice(0, -1);
					term.write('\b \b');
				}
				return;
			}

			// Eingabe puffern
			if (data >= ' ') {
				inputBuffer += data;
				term.write(data);
			}
		});

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(containerEl);

		return () => {
			resizeObserver.disconnect();
			term.dispose();
		};
	});

	async function dispatchCommand(fullCmd: string) {
		const parts = fullCmd.split(' ').filter(Boolean);
		const cmdName = parts[0].toLowerCase();
		const args = parts.slice(1);

		if (cmdName === 'clear') {
			term.clear();
			term.write(prompt());
			return;
		}

		const handler = commandRegistry[cmdName];

		if (handler) {
			activeController = new AbortController();
			try {
				// Pausiert die Shell per Promise, bis das Programm beendet ist
				await handler({
					term,
					args,
					currentNode: host,
					signal: activeController.signal
				});
			} catch (err) {
				term.writeln(`\x1b[31mFehler bei der Ausführung von ${cmdName} (${err})\x1b[0m`);
			} finally {
				activeController = null;
			}
		} else {
			term.writeln(`Befehl nicht gefunden: ${cmdName}`);
		}

		term.write(prompt());
	}
</script>

<div class="terminal-container" bind:this={containerEl}></div>

<style>
	.terminal-container {
		width: 100%;
		height: 100%;
		background: #181825;
		padding: 8px;
		box-sizing: border-box;
	}
</style>
