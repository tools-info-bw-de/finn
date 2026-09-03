<script lang="ts">
	import { onMount } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import { commandRegistry } from './Terminal/commands';
	import { Host } from '$lib/engine/Host.svelte';
	import '@xterm/xterm/css/xterm.css';

	let { host }: { host: Host } = $props();

	let containerEl: HTMLDivElement;
	let term: Terminal;
	let fitAddon: FitAddon;
	let inputBuffer = '';
	let activeController: AbortController | null = null;

	function prompt(): string {
		return `\x1b[1;32m${host.name}\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
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

			// Enter (Befehl absenden)
			if (data === '\r') {
				term.writeln('');
				const trimmed = inputBuffer.trim();
				inputBuffer = '';

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
