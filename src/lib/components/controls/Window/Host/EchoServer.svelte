<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import { tick } from 'svelte';
	import playImg from '$lib/assets/play.svg';
	import stopImg from '$lib/assets/stop.svg';
	import linkImg from '$lib/assets/link.svg';
	import unlinkImg from '$lib/assets/unlink.svg';
	import echoImg from '$lib/assets/echo.png';
	import triangleExclamation from '$lib/assets/triangle-exclamation.svg';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const session = host.echoServer;

	let portInput = $state(String(session.port));
	let portIsValid = $derived(validatePort(portInput));

	function autoScrollLog(node: HTMLDivElement) {
		let detached = false;
		if (session.log.length > 0) {
			void tick().then(() => {
				if (!detached) node.scrollTop = node.scrollHeight;
			});
		}
		return () => {
			detached = true;
		};
	}

	/**
	 * Prüft, ob der eingegebene Port gültig ist (eine ganze Zahl zwischen 1 und 65535).
	 * @param value
	 */
	function validatePort(value: string): boolean {
		if (value === '') return true;
		if (!/^\d+$/.test(value)) return false;

		const port = Number(value);
		return Number.isInteger(port) && port >= 1 && port <= 65535;
	}

	/**
	 * Verarbeitet die Eingabe des Portfeldes und aktualisiert den Serverport, wenn die Eingabe gültig ist.
	 * @param event
	 */
	function handlePortInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		portInput = input.value;

		const isValid = validatePort(portInput);
		input.setCustomValidity(isValid ? '' : 'Port muss eine ganze Zahl zwischen 1 und 65535 sein.');

		if (portInput !== '' && isValid) {
			session.port = Number(portInput);
		}
	}

	/**
	 * Verarbeitet den Klick auf den Server-Toggle-Schalter.
	 * @param event
	 */
	function handleServerToggle(event: Event) {
		const toggle = event.currentTarget as HTMLInputElement;
		const shouldRun = toggle.checked;

		try {
			if (!shouldRun) {
				session.stop();
				return;
			}
			if (!portInput || !validatePort(portInput)) {
				throw new Error('Bitte eine gültige Portnummer eingeben.');
			}
			session.start(Number(portInput));
		} catch (error) {
			toggle.checked = false;
			session.log.push({
				type: 'error',
				message:
					error instanceof Error ? error.message : 'Echo-Server konnte nicht gestartet werden.'
			});
		}
	}
</script>

<div class="background p-2 flex-fill d-flex flex-column">
	<div class="d-flex flex-row align-items-center gap-2">
		<div class="was-validated">
			<input
				bind:value={portInput}
				oninput={handlePortInput}
				class="form-control portInput"
				disabled={session.serverRunning}
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				placeholder="Portnummer"
				aria-label="Portnummer"
				aria-invalid={!portIsValid}
			/>
		</div>
		<div
			class="form-check form-switch runningSwitch d-flex flex-row"
			style:border-color={session.serverRunning ? '#57c569' : '#c55757'}
			style:background-color={session.serverRunning ? '#57c56940' : '#c5575740'}
		>
			<input
				class="form-check-input"
				checked={session.serverRunning}
				onchange={handleServerToggle}
				type="checkbox"
				role="switch"
				id="{host.uuid}-runningSwitchEcho"
			/>
			<label class="form-check-label ms-2 nowrap" for="{host.uuid}-runningSwitchEcho"
				>Server {session.serverRunning ? 'läuft' : 'gestoppt'}</label
			>
		</div>
	</div>

	<div class="logArea flex-fill d-flex flex-column mt-2">
		<div {@attach autoScrollLog} class="logContent flex-fill overflow-auto">
			{#each session.log as entry, index (index)}
				<div class="logEntry d-flex flex-row align-items-center gap-2">
					<span class="logType">
						{#if entry.type === 'serverStarted'}
							<img src={playImg} alt="Server gestartet" width="16" height="16" />
						{:else if entry.type === 'serverStopped'}
							<img src={stopImg} alt="Server gestoppt" width="16" height="16" />
						{:else if entry.type === 'echo'}
							<img src={echoImg} alt="Echo" width="16" height="16" />
						{:else if entry.type === 'connectionOpened'}
							<img src={linkImg} alt="Verbindung geöffnet" width="16" height="16" />
						{:else if entry.type === 'connectionClosed'}
							<img src={unlinkImg} alt="Verbindung geschlossen" width="16" height="16" />
						{:else if entry.type === 'error'}
							<img src={triangleExclamation} alt="Fehler" width="16" height="16" />
						{/if}
					</span>
					<span class="logMessage d-flex flex-column">
						{#if entry.ip && entry.port}
							<span class="text-muted">{entry.ip} : {entry.port}</span>
						{/if}
						{#if entry.type === 'serverStarted'}
							<span class="text-success">Server gestartet</span>
						{:else if entry.type === 'serverStopped'}
							<span class="text-warning">Server gestoppt</span>
						{:else if entry.type === 'connectionOpened'}
							<span class="text-success">Neue Verbindung geöffnet</span>
						{:else if entry.type === 'connectionClosed'}
							<span class="text-warning">Verbindung geschlossen</span>
						{:else if entry.type === 'error'}
							<span class="text-danger">{entry.message}</span>
						{:else if entry.type === 'echo'}
							<span class="text-info">{entry.message}</span>
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.background {
		min-height: 0;
	}

	.logEntry {
		font-size: 0.85rem;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid #45475a;
	}

	.logMessage > .text-muted {
		font-size: 0.75rem;
	}

	.logArea {
		border: 1px solid #45475a;
		border-radius: 0.5rem;
		padding: 0.25rem 0.5rem;
		min-height: 0;
		overflow: hidden;
	}

	.logContent {
		min-height: 0;
		flex: 1 1 0;
		overflow-y: auto;
	}

	:global([data-bs-theme='light'] .logArea) {
		border-color: #c6c9cf;
	}

	.portInput {
		width: 9rem;
	}

	.nowrap {
		white-space: nowrap;
	}

	.runningSwitch input[type='checkbox'] {
		margin-left: 0 !important;
	}

	.runningSwitch {
		padding: 0.2rem 0.5rem;
		border: 1px solid;
		border-radius: 0.5rem;
		border-color: #57c569;
		transition: all 0.2s ease;
	}
</style>
