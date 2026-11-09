<script lang="ts">
	import { tick } from 'svelte';
	import type { Host } from '$lib/engine/Host.svelte';
	import linkImg from '$lib/assets/link.svg';
	import unlinkImg from '$lib/assets/unlink.svg';
	import envelopeImg from '$lib/assets/envelope.svg';
	import echoImg from '$lib/assets/echo.png';
	import triangleExclamation from '$lib/assets/triangle-exclamation.svg';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const session = host.simpleClientState();
	let messageInput = $state('');
	let portInput = $state(String(session.serverPort));
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
			session.serverPort = Number(portInput);
		}
	}

	function startConnection(event: SubmitEvent) {
		event.preventDefault();
		if (!portInput || !validatePort(portInput)) {
			session.log.push({ type: 'error', message: 'Bitte eine gültige Portnummer eingeben.' });
			return;
		}
		void session.connect(Number(portInput));
	}

	function sendMessage(event: SubmitEvent) {
		event.preventDefault();
		session.send(messageInput);
		if (session.connectionStatus === 'connected') messageInput = '';
	}
</script>

<div class="background p-2 flex-fill d-flex flex-column">
	<form class="d-flex flex-row gap-3" onsubmit={startConnection}>
		<div class="form-floating">
			<input
				bind:value={session.serverAddress}
				class="form-control"
				id="{host.uuid}-simpleClientAddress"
				type="text"
				placeholder="Server-Adresse"
				disabled={session.connectionStatus !== 'disconnected'}
			/>
			<label for="{host.uuid}-simpleClientAddress">Server-Adresse</label>
		</div>
		<div class="form-floating was-validated">
			<input
				bind:value={portInput}
				oninput={handlePortInput}
				class="form-control"
				id="{host.uuid}-simpleClientPort"
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				placeholder="Server-Port"
				disabled={session.connectionStatus !== 'disconnected'}
				aria-invalid={!portIsValid}
			/>
			<label for="{host.uuid}-simpleClientPort">Server-Port</label>
		</div>

		{#if session.connectionStatus === 'connected' || session.connectionStatus === 'closing'}
			<button
				class="btn btn-secondary nowrap"
				type="button"
				onclick={() => session.disconnect()}
				disabled={session.connectionStatus !== 'connected'}
			>
				Trennen
				{#if session.connectionStatus === 'closing'}<div
						class="spinner-border spinner-border-sm"
						role="status"
					>
						<span class="visually-hidden">Loading...</span>
					</div>
				{/if}
			</button>
		{:else}
			<button
				class="btn btn-primary nowrap"
				type="submit"
				disabled={session.connectionStatus !== 'disconnected'}
			>
				Verbinden
				{#if session.connectionStatus === 'connecting'}<div
						class="spinner-border spinner-border-sm"
						role="status"
					>
						<span class="visually-hidden">Loading...</span>
					</div>
				{/if}
			</button>
		{/if}
	</form>

	<hr class="my-2" />

	<form class="d-flex flex-row gap-3" onsubmit={sendMessage}>
		<div class="form-floating">
			<input
				bind:value={messageInput}
				class="form-control"
				id="{host.uuid}-simpleClientMessage"
				type="text"
				required
				placeholder="Nachricht"
				disabled={session.connectionStatus !== 'connected'}
			/>
			<label for="{host.uuid}-simpleClientMessage">Nachricht</label>
		</div>
		<button
			class="btn btn-primary"
			type="submit"
			disabled={session.connectionStatus !== 'connected' || messageInput.length === 0}
			>Senden</button
		>
	</form>

	<hr class="my-2" />

	<div class="logArea flex-fill d-flex flex-column mt-2">
		<div {@attach autoScrollLog} class="logContent flex-fill overflow-auto">
			{#each session.log as entry, index (index)}
				<div class="logEntry d-flex flex-row align-items-center gap-2">
					<span class="logType">
						{#if entry.type === 'connected'}
							<img src={linkImg} alt="Verbunden" width="16" height="16" />
						{:else if entry.type === 'disconnected'}
							<img src={unlinkImg} alt="Getrennt" width="16" height="16" />
						{:else if entry.type === 'sent'}
							<img src={envelopeImg} alt="Gesendet" width="16" height="16" />
						{:else if entry.type === 'received'}
							<img src={echoImg} alt="Empfangen" width="16" height="16" />
						{:else if entry.type === 'error'}
							<img src={triangleExclamation} alt="Fehler" width="16" height="16" />
						{/if}
					</span>
					<span class="logMessage">
						{#if entry.type === 'connected'}
							<span class="text-success">{entry.message}</span>
						{:else if entry.type === 'disconnected'}
							<span class="text-warning">{entry.message}</span>
						{:else if entry.type === 'sent'}
							<span class="text-info">{entry.message}</span>
						{:else if entry.type === 'received'}
							<span class="text-info">{entry.message}</span>
						{:else if entry.type === 'error'}
							<span class="text-danger">{entry.message}</span>
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.nowrap {
		white-space: nowrap;
	}

	.logEntry {
		font-size: 0.85rem;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid #45475a;
	}

	.background {
		min-height: 0;
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

	.form-floating > input {
		padding-top: 1.2rem !important;
		padding-left: 0.75rem !important;
		padding-right: 0.4rem !important;
		padding-bottom: 0.1rem !important;
		height: 3rem !important;
		min-height: 1rem !important;
	}
	.form-floating > label {
		padding: 0.75rem 0.75rem !important;
		font-size: 0.9rem !important;
	}
</style>
