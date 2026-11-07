<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import type { TCPConnection } from '$lib/engine/TCPService';
	import { isValidIPv4 } from '$lib/engine/helpers';

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
	const logTypeLabels: Record<logEntry['type'], string> = {
		connected: 'Verbunden',
		disconnected: 'Getrennt',
		sent: 'Gesendet',
		received: 'Empfangen',
		error: 'Fehler'
	};

	let clientAppOpen = $derived(host.apps.some((app) => app.type === 'simple-client'));
	let portIsValid = $derived(validatePort(portInput));

	function autoScrollLog(node: HTMLDivElement) {
		$effect(() => {
			if (log.length > 0) node.scrollTop = node.scrollHeight;
		});
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
		addLog('connected', `Verbinde mit ${serverAddress}:${serverPort} ...`);

		try {
			const connection = host.tcp.connect(serverAddress, serverPort, () => {
				if (attempt !== connectionAttempt) return;
				connectionStatus = 'connected';
				addLog('connected', `Verbunden mit ${serverAddress}:${serverPort}.`);
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
			connection.send(new TextEncoder().encode(message), () => {
				if (activeConnection !== connection) return;
				sendingMessage = false;
				addLog('sent', message);
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
		<button class="btn btn-primary" type="submit" disabled={connectionStatus !== 'disconnected'}>
			{connectionStatus === 'connecting' ? 'Verbinde ...' : 'Verbinden'}
		</button>
		{#if connectionStatus === 'connected'}
			<button class="btn btn-outline-secondary" type="button" onclick={disconnect}>Trennen</button>
		{/if}
	</form>
	<div class="connectionStatus" aria-live="polite">
		{connectionStatus === 'connected'
			? 'Verbunden'
			: connectionStatus === 'connecting'
				? 'Verbindung wird aufgebaut ...'
				: connectionStatus === 'closing'
					? 'Verbindung wird geschlossen ...'
					: 'Nicht verbunden'}
	</div>

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
				<div class={['logEntry', { errorEntry: entry.type === 'error' }]}>
					<strong>{logTypeLabels[entry.type]}:</strong>
					{entry.message}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
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

	.connectionStatus {
		font-size: 0.85rem;
		padding-top: 0.35rem;
	}

	.errorEntry {
		color: var(--bs-danger-text-emphasis);
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
