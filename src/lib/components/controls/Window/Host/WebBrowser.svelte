<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import browserImg from '$lib/assets/browser.png';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const browser = host.webBrowser;

	let frame = $state<HTMLIFrameElement | null>(null);
	// Wird bei jedem neuen Dokument im iframe true, sobald es geladen ist
	let frameReady = $state(false);
	// Bereits ins iframe übertragene Dateien (nicht reaktiv)
	let sent: Record<string, true> = {};

	// Neues Dokument -> iframe lädt neu, bisher übertragene Dateien verfallen
	$effect.pre(() => {
		void browser.document;
		frameReady = false;
		sent = {};
	});

	// Fertig geladene Dateien nacheinander in die Seite einsetzen
	$effect(() => {
		if (!frameReady || !frame?.contentWindow) return;
		for (const resource of browser.resources) {
			if (resource.status !== 'done' || sent[resource.id]) continue;
			sent[resource.id] = true;
			frame.contentWindow.postMessage(
				{
					type: 'finn-resource',
					id: resource.id,
					kind: resource.kind,
					content: resource.content
				},
				'*'
			);
		}
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void browser.navigate(browser.url);
	}

	// Klick auf einen Link innerhalb der Seite
	function handleMessage(event: MessageEvent) {
		if (!frame || event.source !== frame.contentWindow) return;
		const data = event.data as { type?: string; href?: unknown };
		if (data?.type !== 'finn-navigate' || typeof data.href !== 'string') return;
		void browser.navigate(data.href, browser.pageUrl ?? undefined);
	}

	// Klicks in das iframe erreichen das Window nicht. Beim Klick verliert aber das Hauptfenster
	// den Fokus an das iframe -> dann ein pointerdown weiterreichen, damit das Window nach vorne kommt.
	function handleWindowBlur() {
		setTimeout(() => {
			if (frame && document.activeElement === frame) {
				frame.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			}
		});
	}
</script>

<svelte:window onmessage={handleMessage} onblur={handleWindowBlur} />

<div class="background flex-fill d-flex flex-column">
	<form class="d-flex flex-row gap-2 p-2" onsubmit={submit}>
		<input
			type="text"
			class="form-control form-control-sm"
			bind:value={browser.url}
			placeholder="http://"
			aria-label="URL"
			spellcheck="false"
			autocomplete="off"
		/>
		<button
			class="d-flex flex-row align-items-center btn btn-primary btn-sm"
			type="submit"
			disabled={browser.loading}
		>
			{#if browser.loading}
				<div class="spinner-border spinner-border-sm me-2" role="status">
					<span class="visually-hidden">Loading...</span>
				</div>
			{/if}
			Start
		</button>
	</form>

	<div class="page flex-fill">
		{#if browser.error}
			<div class="error h-100 d-flex flex-column align-items-center justify-content-center">
				<div class="fw-bold">{browser.error.title}</div>
				<div class="small text-muted">{browser.error.detail}</div>
			</div>
		{:else if browser.document !== null}
			<iframe
				bind:this={frame}
				title="Webseite"
				sandbox="allow-scripts"
				srcdoc={browser.document}
				onload={() => (frameReady = true)}
			></iframe>
		{:else}
			<div class="d-flex flex-column align-items-center justify-content-center">
				FireKitten - der Browser der schnurrt!<br />
				<img src={browserImg} alt="Kätzchen mit Ball" class="browserImg mb-2" />
			</div>
		{/if}
	</div>

	{#if browser.loading && browser.currentRequest}
		<div class="statusBar small text-muted px-2">
			{#if browser.loading && browser.currentRequest}
				Lade {browser.currentRequest} …
			{/if}
		</div>
	{/if}
</div>

<style>
	.browserImg {
		width: 200px;
		height: 200px;
		object-fit: contain;
	}

	.background {
		min-height: 0;
		background-color: var(--bs-body-bg);
	}

	.page {
		min-height: 0;
		background-color: #fff;
		color: #11111b;
		position: relative;
	}

	iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: none;
		background-color: #fff;
	}

	.error .text-muted {
		color: #6c757d !important;
	}

	.statusBar {
		min-height: 1.4rem;
		line-height: 1.4rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-top: 1px solid #45475a;
	}
</style>
