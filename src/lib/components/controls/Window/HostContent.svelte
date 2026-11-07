<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import Terminal from './Host/Terminal.svelte';
	import terminal from '$lib/assets/terminal.png';
	import SimpleClient from './Host/SimpleClient.svelte';
	import dns from '$lib/assets/dns.png';
	import echo from '$lib/assets/echo.png';
	import simpleClient from '$lib/assets/simple-client.png';
	import { fly, scale } from 'svelte/transition';
	import type { AppType } from '$lib/engine/types';
	import HostAppDock from './Host/HostAppDock.svelte';
	import DNS from './Host/DNS.svelte';
	import EchoServer from './Host/EchoServer.svelte';

	let { host }: { host: Host } = $props();

	let subMenuOpen = $state(0);
	let startMenuOpen = $state(false);

	function windowClick(event: MouseEvent) {
		if (startMenuOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.dropup')) {
				closeMenus();
			}
		}
	}

	// true while one app replaces another, so the old window disappears without animation
	let switchingApp = $state(false);

	function openApp(appType: AppType) {
		closeMenus();

		if (host.currentApp === appType) return;

		switchingApp = true;
		host.openApp(appType);
	}

	function closeMenus() {
		subMenuOpen = 0;
		startMenuOpen = false;
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
			{#if host.currentApp !== 'echo-server' && host.currentApp !== 'simple-client'}
				<div
					class="window"
					in:scale={{ start: 0.9, duration: 300 }}
					out:scale={{ start: 0.9, duration: switchingApp ? 0 : 400 }}
				>
					{#if host.currentApp === 'terminal'}
						<div class="appTitle">
							<img src={terminal} alt="Terminal" />
							Terminal
						</div>
						<Terminal {host} />
					{:else if host.currentApp === 'dns'}
						<div class="appTitle">
							<img src={dns} alt="DNS" />
							DNS
						</div>
						<DNS {host} />
					{/if}
				</div>
			{/if}
		{/key}
		{#if host.apps.some((app) => app.type === 'echo-server')}
			<div
				class={['window echoWindow', { windowHidden: host.currentApp !== 'echo-server' }]}
				in:scale={{ start: 0.9, duration: 300 }}
				out:scale={{ start: 0.9, duration: switchingApp ? 0 : 400 }}
			>
				<div class="appTitle">
					<img src={echo} alt="Echo-Server" />
					Echo-Server
				</div>
				<EchoServer {host} />
			</div>
		{/if}
		{#if host.apps.some((app) => app.type === 'simple-client')}
			<div
				class={['window echoWindow', { windowHidden: host.currentApp !== 'simple-client' }]}
				in:scale={{ start: 0.9, duration: 300 }}
				out:scale={{ start: 0.9, duration: switchingApp ? 0 : 400 }}
			>
				<div class="appTitle">
					<img src={simpleClient} alt="Simple Client" />
					Simple Client
				</div>
				<SimpleClient {host} />
			</div>
		{/if}
	</div>

	<div class="footer d-flex flex-row">
		<div class="dropup">
			<button
				class="startMenuButton dropdown-toggle d-flex flex-row align-items-center"
				data-bs-auto-close="outside"
				onclick={() => {
					if (startMenuOpen) {
						closeMenus();
					} else {
						startMenuOpen = true;
					}
				}}
			>
				<div
					class="startMenuIcon me-1 d-flex flex-row align-items-center justify-content-center miniGap"
				>
					<div class="d-flex flex-column h-100 miniGap">
						<div class="block block60"></div>
						<div class="block block40"></div>
					</div>
					<div class="d-flex flex-column h-100 miniGap">
						<div class="block block40"></div>
						<div class="block block60"></div>
					</div>
				</div>

				Start</button
			>

			{#if startMenuOpen}
				<!-- svelte-ignore a11y_invalid_attribute -->
				<ul class="startMenuContent dropdown-menu show" transition:fly={{ y: 10, duration: 150 }}>
					<li>
						<a
							class="dropdown-item"
							href="#"
							onclick={() => {
								openApp('terminal');
							}}
						>
							<img src={terminal} alt="Terminal" />
							Terminal</a
						>
					</li>
					<li>
						<a
							class="dropdown-item"
							href="#"
							onclick={() => {
								openApp('dns');
							}}
						>
							<img src={dns} alt="DNS" />
							DNS-Server</a
						>
					</li>
					<li class="dropend">
						<a
							class="dropdown-item dropdown-toggle"
							data-bs-auto-close="outside"
							href="#"
							onclick={() => {
								if (subMenuOpen === 1) {
									subMenuOpen = 0;
								} else {
									subMenuOpen = 1;
								}
							}}>Echo-Server</a
						>
						{#if subMenuOpen === 1}
							<ul class="subMenu dropdown-menu show" transition:fly={{ x: -10, duration: 150 }}>
								<li>
									<a
										class="dropdown-item"
										href="#"
										onclick={() => {
											openApp('echo-server');
										}}
									>
										<img src={echo} alt="Echo-Server" />
										Echo-Server
									</a>
								</li>
								<li>
									<a
										class="dropdown-item"
										href="#"
										onclick={() => {
											openApp('simple-client');
										}}
									>
										<img src={simpleClient} alt="Simple Client" />
										Einfacher Client</a
									>
								</li>
							</ul>
						{/if}
					</li>
					<li class="dropend">
						<a
							class="dropdown-item dropdown-toggle"
							data-bs-auto-close="outside"
							href="#"
							onclick={() => {
								if (subMenuOpen === 2) {
									subMenuOpen = 0;
								} else {
									subMenuOpen = 2;
								}
							}}>WWW</a
						>
						{#if subMenuOpen === 2}
							<ul class="subMenu dropdown-menu show" transition:fly={{ x: -10, duration: 150 }}>
								<li>
									<a
										class="dropdown-item"
										href="#"
										onclick={() => {
											openApp('web-server');
										}}>Web-Server</a
									>
								</li>
								<li>
									<a
										class="dropdown-item"
										href="#"
										onclick={() => {
											openApp('web-browser');
										}}>Web-Browser</a
									>
								</li>
								<li>
									<a
										class="dropdown-item"
										href="#"
										onclick={() => {
											openApp('editor');
										}}>Editor</a
									>
								</li>
							</ul>
						{/if}
					</li>
					<li>
						<a class="dropdown-item" href="#" onclick={() => closeApp()}>Close current app</a>
					</li>
				</ul>
			{/if}
		</div>
		<HostAppDock apps={host.apps} {openApp} />
	</div>
</div>

<style>
	.startMenuIcon {
		width: 20px;
		height: 20px;
	}

	.miniGap {
		gap: 2px;
	}

	.block {
		background-color: #fe5d3a;
		width: 10px;
		border-radius: 2px;
	}

	.block60 {
		height: 60%;
	}

	.block40 {
		height: 40%;
	}

	.appTitle img {
		width: 24px;
		height: 24px;
	}

	li a img {
		width: 24px;
		height: 24px;
	}

	.startMenuContent,
	.subMenu {
		background-color: transparent;
	}

	.startMenuContent {
		bottom: 100%;
		top: auto;
	}

	/* Blur on a pseudo-element: a nested backdrop-filter would otherwise not see the window behind */
	.startMenuContent::before,
	.subMenu::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		backdrop-filter: blur(5px);
		background-color: #ffffff94;
	}

	.dropdown-item {
		color: black !important;
	}

	.dropdown-item::after {
		margin-left: 0.5rem;
	}

	.subMenu {
		top: auto;
		bottom: calc(-1 * var(--bs-dropdown-padding-y));
		left: 100%;
		right: auto;
	}

	.windowArea {
		flex: 1;
		overflow: hidden;
	}

	.window-background {
		background-image: url($lib/assets/bliss.jpg);
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

	.windowHidden {
		display: none;
	}

	.appTitle {
		background-color: #4d4d4d;
		padding: 2px 8px;
		font-size: 0.9rem;
		font-weight: bold;
	}

	:global([data-bs-theme='light'] .appTitle) {
		background-color: #b4b4b4;
		color: #11111b;
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
		background-color: #f1f4f2a0;
		backdrop-filter: blur(5px) saturate(0.7);
		color: #11111b;
	}

	.startMenuButton::after {
		display: none;
	}
</style>
