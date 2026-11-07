<script lang="ts">
	import { tick } from 'svelte';
	import type { Host } from '$lib/engine/Host.svelte';
	import type { TCPConnection } from '$lib/engine/TCPService';
	import { isValidIPv4 } from '$lib/engine/helpers';
	import linkImg from '$lib/assets/link.svg';
	import unlinkImg from '$lib/assets/unlink.svg';
	import envelopeImg from '$lib/assets/envelope.svg';
	import echoImg from '$lib/assets/echo.png';
	import triangleExclamation from '$lib/assets/triangle-exclamation.svg';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const session = host.simpleClientState();
	let activeConnection: TCPConnection | null = null;

	let messageInput = $state('');
	let connectionStatus = $state<'disconnected' | 'connecting' | 'connected' | 'closing'>(
		'disconnected'
	);
	let portInput = $state(String(session.serverPort));
	let sendingMessage = false;
	let closeWhenDrained = false;
	let connectionAttempt = 0;
	let pendingMessages: string[] = [];
	let detachConnectionListeners: (() => void)[] = [];

	type logEntry = {
		type: 'connected' | 'disconnected' | 'sent' | 'received' | 'error';
		message: string;
	};
	let log = $state<logEntry[]>([]);

	let clientAppOpen = $derived(host.apps.some((app) => app.type === 'simple-client'));
	let portIsValid = $derived(validatePort(portInput));

	function autoScrollLog(node: HTMLDivElement) {
		let detached = false;
		if (log.length > 0) {
			void tick().then(() => {
				if (!detached) node.scrollTop = node.scrollHeight;
			});
		}
		return () => {
			detached = true;
		};
	}

	$effect(() => {
		if (!clientAppOpen) return;
		return disconnect;
	});

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

	function addLog(type: logEntry['type'], message: string) {
		log.push({ type, message });
	}

	function startConnection(event: SubmitEvent) {
		event.preventDefault();
		if (activeConnection) return;

		const serverAddress = session.serverAddress.trim();
		if (!isValidIPv4(serverAddress)) {
			addLog('error', 'Bitte eine gültige IPv4-Adresse eingeben.');
			return;
		}
		if (!portInput || !validatePort(portInput)) {
			addLog('error', 'Bitte eine gültige Portnummer eingeben.');
			return;
		}

		const serverPort = Number(portInput);
		const attempt = ++connectionAttempt;
		closeWhenDrained = false;
		connectionStatus = 'connecting';

		try {
			const connection = host.tcp.connect(serverAddress, serverPort, () => {
				if (attempt !== connectionAttempt) return;
				connectionStatus = 'connected';
				addLog('connected', `Verbunden mit ${serverAddress}:${serverPort}`);
				if (closeWhenDrained) closeConnection();
				else sendNextMessage();
			});

			activeConnection = connection;
			session.serverPort = serverPort;
			detachConnectionListeners = [
				connection.onData((payload) => {
					if (activeConnection !== connection) return;
					addLog('received', new TextDecoder().decode(payload));
				}),
				connection.onClose(() =>
					finishConnection(connection, 'disconnected', 'Verbindung geschlossen.')
				),
				connection.onError((error) => finishConnection(connection, 'error', error.message))
			];
		} catch (error) {
			connectionStatus = 'disconnected';
			addLog(
				'error',
				error instanceof Error ? error.message : 'Verbindung konnte nicht gestartet werden.'
			);
		}
	}

	function sendMessage(event: SubmitEvent) {
		event.preventDefault();
		if (!activeConnection || connectionStatus !== 'connected') {
			addLog('error', 'Es besteht keine Verbindung zum Server.');
			return;
		}
		if (messageInput.length === 0) return;

		pendingMessages.push(messageInput);
		messageInput = '';
		sendNextMessage();
	}

	function sendNextMessage() {
		if (sendingMessage || !activeConnection) return;
		if (closeWhenDrained && pendingMessages.length === 0) {
			closeConnection();
			return;
		}
		if (connectionStatus !== 'connected') return;

		const message = pendingMessages.shift();
		if (message === undefined) {
			return;
		}

		const connection = activeConnection;
		sendingMessage = true;
		try {
			addLog('sent', message);
			connection.send(new TextEncoder().encode(message), () => {
				if (activeConnection !== connection) return;
				sendingMessage = false;
				sendNextMessage();
			});
		} catch (error) {
			sendingMessage = false;
			addLog(
				'error',
				error instanceof Error ? error.message : 'Nachricht konnte nicht gesendet werden.'
			);
		}
	}

	function disconnect() {
		if (!activeConnection) return;
		const wasConnecting = connectionStatus === 'connecting';
		closeWhenDrained = true;
		pendingMessages = [];
		connectionStatus = 'closing';
		if (wasConnecting) return;
		if (!sendingMessage) closeConnection();
	}

	function closeConnection() {
		if (!activeConnection || connectionStatus === 'connecting' || sendingMessage) return;
		try {
			activeConnection.close();
		} catch (error) {
			closeWhenDrained = false;
			connectionStatus = 'connected';
			addLog(
				'error',
				error instanceof Error ? error.message : 'Verbindung konnte nicht geschlossen werden.'
			);
		}
	}

	function finishConnection(
		connection: TCPConnection,
		type: 'disconnected' | 'error',
		message: string
	) {
		if (activeConnection !== connection) return;
		for (const detach of detachConnectionListeners) detach();
		detachConnectionListeners = [];
		activeConnection = null;
		connectionAttempt++;
		connectionStatus = 'disconnected';
		sendingMessage = false;
		closeWhenDrained = false;
		pendingMessages = [];
		addLog(type, message);
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
				aria-invalid={!portIsValid}
			/>
			<label for="{host.uuid}-simpleClientPort">Server-Port</label>
		</div>

		{#if connectionStatus === 'connected' || connectionStatus === 'closing'}
			<button
				class="btn btn-outline-secondary nowrap"
				type="button"
				onclick={disconnect}
				disabled={connectionStatus !== 'connected'}
			>
				Trennen
				{#if connectionStatus === 'closing'}<div
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
				disabled={connectionStatus !== 'disconnected'}
			>
				Verbinden
				{#if connectionStatus === 'connecting'}<div
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
			/>
			<label for="{host.uuid}-simpleClientMessage">Nachricht</label>
		</div>
		<button
			class="btn btn-primary"
			type="submit"
			disabled={connectionStatus !== 'connected' || messageInput.length === 0}>Senden</button
		>
	</form>

	<hr class="my-2" />

	<div class="logArea flex-fill d-flex flex-column mt-2">
		<div {@attach autoScrollLog} class="logContent flex-fill overflow-auto">
			{#each log as entry, index (index)}
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
