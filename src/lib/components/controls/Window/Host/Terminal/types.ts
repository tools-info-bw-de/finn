import type { Terminal } from '@xterm/xterm';
import type { Host } from '$lib/engine/Host.svelte';

export interface CommandContext {
	term: Terminal;
	args: string[];
	currentNode: Host;
	signal: AbortSignal; // Erlaubt Abbruch per Strg+C
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>;
