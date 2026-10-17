<script lang="ts">
	import type { App, AppType } from '$lib/engine/types';
	import terminal from '$lib/assets/terminal.png';
	import dns from '$lib/assets/dns.png';
	import { slide } from 'svelte/transition';

	let { apps, openApp }: { apps: App[]; openApp: (appType: AppType) => void } = $props();
</script>

<div class="flex-grow-1 app-dock">
	{#each apps as app (app.type)}
		<button
			transition:slide={{ axis: 'x' }}
			onclick={() => {
				openApp(app.type);
			}}
		>
			{#if app.type === 'terminal'}
				<img src={terminal} alt={app.type} />
			{:else if app.type === 'dns'}
				<img src={dns} alt={app.type} />
			{/if}
		</button>
	{/each}
</div>

<style>
	button {
		background-color: transparent;
		border: none;
		transition: 0.1s ease-in-out;
	}

	button:hover {
		scale: 1.3;
		transform: translateY(-3px);
	}

	img {
		width: 30px;
		height: 30px;
	}

	.app-dock {
		display: flex;
		flex-direction: row;
		align-items: center;
		border: 1px solid #45475a7c;
		margin: 2px 4px;
		border-radius: 10px;
		backdrop-filter: blur(5px) saturate(0.7);
		background-color: #ffffff54;
	}
</style>
