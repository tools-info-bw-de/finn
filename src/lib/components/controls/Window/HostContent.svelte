<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import startMenu from '$lib/assets/start-menu.png';
	import Terminal from './Host/Terminal.svelte';
	import { fly, scale } from 'svelte/transition';
	import type { AppType } from '$lib/engine/types';

	let { host }: { host: Host } = $props();

	let startMenuOpen = $state(false);

	function windowClick(event: MouseEvent) {
		if (startMenuOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.dropup')) {
				startMenuOpen = false;
			}
		}
	}

	// true while one app replaces another, so the old window disappears without animation
	let switchingApp = $state(false);

	function openApp(appType: AppType) {
		startMenuOpen = false;
		if (host.currentApp === appType) return;

		switchingApp = true;
		host.openApp(appType);
	}

	// Call to close the current app; its window plays the out animation
	export function closeApp() {
		if (host.currentApp === '') return;

		switchingApp = false;
		host.closeCurrentApp();
	}
</script>

<svelte:window onclick={windowClick} />

<div class="d-flex flex-column h-100 window-background">
	<div class="windowArea">
		{#key host.currentApp}
			<div
				class="window"
				in:scale={{ start: 0.9, duration: 300 }}
				out:scale={{ start: 0.9, duration: switchingApp ? 0 : 400 }}
			>
				{#if host.currentApp === 'terminal'}
					<div class="appTitle">Terminal</div>
					<Terminal {host} />
				{:else if host.currentApp === 'dns'}
					<div class="appTitle">DNS</div>
					<!-- DNS App Content Here -->
				{/if}
			</div>
		{/key}
	</div>

	<div class="footer d-flex flex-row">
		<div class="dropup">
			<button
				class="startMenuButton dropdown-toggle"
				onclick={() => (startMenuOpen = !startMenuOpen)}
				><img src={startMenu} alt="Icon" />Start</button
			>

			{#if startMenuOpen}
				<!-- svelte-ignore a11y_invalid_attribute -->
				<ul class="startMenuContent dropdown-menu show" transition:fly={{ y: 10, duration: 200 }}>
					<li>
						<a
							class="dropdown-item"
							href="#"
							onclick={() => {
								openApp('terminal');
							}}>Terminal</a
						>
					</li>
					<li>
						<a
							class="dropdown-item"
							href="#"
							onclick={() => {
								openApp('dns');
							}}>DNS-Server</a
						>
					</li>
					<li>
						<a class="dropdown-item" href="#" onclick={() => closeApp()}>Close current app</a>
					</li>
				</ul>
			{/if}
		</div>
		<div class="flex-grow-1 app-dock">
			{#each host.apps as app (app.type)}
				<button
					class="startMenuButton"
					onclick={() => {
						openApp(app.type);
					}}
				>
					{app.type}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.app-dock {
		border: 1px solid #45475a7c;
		margin: 2px 4px;
		border-radius: 8px;
		backdrop-filter: blur(5px) saturate(0.7);
	}

	.startMenuContent {
		bottom: 100%;
		top: auto;
	}

	.windowArea {
		flex: 1;
		overflow: hidden;
	}

	.window-background {
		background-image: url($lib/assets/bliss.png);
		background-repeat: no-repeat;
		background-position: center;
		background-size: cover;
		overflow: hidden;
	}

	.window {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.appTitle {
		background-color: #4d4d4d;
		padding: 2px 8px;
		font-size: 0.9rem;
		font-weight: bold;
	}

	.footer {
		position: sticky;
		bottom: 0;
		width: 100%;
		height: 32px;
	}

	.startMenuButton {
		height: 32px;
		border: none;
		border-top-right-radius: 5px;
	}

	.startMenuButton::after {
		display: none;
	}

	.startMenuButton img {
		height: 100%;
	}
</style>
