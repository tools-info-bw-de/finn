<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { settings } from '$lib/states/settings.svelte';

	let { host }: { host: Host } = $props();

	const relevantApps: SvelteMap<string, string> = new SvelteMap<string, string>()
		.set('dns', 'DNS')
		.set('web-server', 'WWW')
		.set('echo-server', 'Echo');

	function isAppRunning(app: { type: string; content: unknown }): boolean {
		if (app.type === 'dns') {
			return host.dnsState().serverRunning;
		} else if (app.type === 'web-server') {
			//return host.webServerState().serverRunning;
		} else if (app.type === 'echo-server') {
			//return host.echoServerState().serverRunning;
		}
		return false;
	}
</script>

<div class="d-flex flex-column gap-1">
	{#each host.apps as app (app.type)}
		{#if relevantApps.has(app.type)}
			{@const appRunning = isAppRunning(app)}
			<div class="d-flex align-items-center">
				<span
					class="badge"
					style:background-color={settings.mode === 'edit'
						? '#3c709e90'
						: appRunning
							? '#57c56980'
							: '#c5575780'}
					style:border-color={settings.mode === 'edit' ? '' : appRunning ? '#57c589' : '#c55787'}
					>{relevantApps.get(app.type)}</span
				>
			</div>
		{/if}
	{/each}
</div>

<style scoped>
	.badge {
		font-size: 0.6rem !important;
	}
</style>
