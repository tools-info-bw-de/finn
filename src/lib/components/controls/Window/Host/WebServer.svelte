<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import {
		DEFAULT_DOCUMENT_ROOT,
		WEB_ROOT,
		WEB_SERVER_PORT
	} from '$lib/engine/services/WebServerService.svelte';
	import { tick } from 'svelte';
	import trash from '$lib/assets/trash.svg';
	import { slide } from 'svelte/transition';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const session = host.webServer;

	let newHostname = $state('');
	let newDirectory = $state('');
	let vhostError = $state('');

	let logContent = $state<HTMLDivElement | null>(null);

	// Bei neuen Log-Einträgen ans Ende scrollen
	$effect(() => {
		void session.log.length;
		const node = logContent;
		if (!node) return;
		void tick().then(() => {
			node.scrollTop = node.scrollHeight;
		});
	});

	function handleServerToggle(event: Event) {
		const toggle = event.currentTarget as HTMLInputElement;
		if (!toggle.checked) {
			session.stop();
			return;
		}
		try {
			session.start();
		} catch (error) {
			toggle.checked = false;
			session.logStartError(error);
		}
	}

	function addVHost(event: SubmitEvent) {
		event.preventDefault();
		try {
			session.addVHost(newHostname, newDirectory.trim() || newHostname.trim());
			newHostname = '';
			newDirectory = '';
			vhostError = '';
		} catch (error) {
			vhostError = error instanceof Error ? error.message : 'VHost konnte nicht angelegt werden.';
		}
	}
</script>

<div class="background p-2 flex-fill d-flex flex-column">
	<div class="d-flex flex-row justify-content-between align-items-center gap-2 flex-wrap">
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
				id="{host.uuid}-runningSwitchWeb"
			/>
			<label class="form-check-label ms-2 nowrap" for="{host.uuid}-runningSwitchWeb"
				>Server {session.serverRunning ? 'läuft' : 'gestoppt'} (Port {WEB_SERVER_PORT})</label
			>
		</div>

		<div class="form-check d-flex flex-row">
			<input
				class="form-check-input"
				bind:checked={session.useVHosts}
				type="checkbox"
				id="{host.uuid}-useVHosts"
			/>
			<label class="form-check-label ms-2 nowrap" for="{host.uuid}-useVHosts"
				>Virtuelle Hosts nutzen</label
			>
		</div>
	</div>

	<div class="text-muted small mt-1">
		Standard-Verzeichnis: <code>{DEFAULT_DOCUMENT_ROOT}</code>
	</div>

	{#if session.useVHosts}
		<div transition:slide>
			<hr class="my-2" />
			<form onsubmit={addVHost}>
				<div class="d-flex flex-row align-items-center gap-2">
					<div class="form-floating flex-fill">
						<input
							type="text"
							bind:value={newHostname}
							class="form-control"
							id="{host.uuid}-vhostName"
							placeholder="Hostname"
						/>
						<label for="{host.uuid}-vhostName">Hostname</label>
					</div>
					<div class="input-group flex-fill">
						<span class="input-group-text">{WEB_ROOT}/</span>
						<div class="form-floating">
							<input
								type="text"
								bind:value={newDirectory}
								class="form-control"
								id="{host.uuid}-vhostDir"
								placeholder={newHostname.trim() || 'Verzeichnis'}
							/>
							<label for="{host.uuid}-vhostDir">Verzeichnis</label>
						</div>
					</div>
					<button class="btn btn-primary btn-sm nowrap" type="submit">Hinzufügen</button>
				</div>
				{#if vhostError}
					<div class="text-danger small mt-1">{vhostError}</div>
				{/if}
			</form>

			{#if session.vhosts.length > 0}
				<div class="vhosts-scroll mt-2">
					<table class="table table-sm table-hover mb-0 table-bordered">
						<thead>
							<tr>
								<th scope="col">Hostname</th>
								<th scope="col">Verzeichnis</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each session.vhosts as vhost (vhost.uuid)}
								<tr>
									<td>{vhost.hostname}</td>
									<td><code>{WEB_ROOT}/{vhost.directory}</code></td>
									<td class="text-center">
										<button
											class="btn btn-danger btn-sm"
											aria-label="VHost löschen"
											onclick={() => session.removeVHost(vhost.uuid)}
										>
											<img src={trash} alt="Löschen" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}

	<div class="logArea flex-fill d-flex flex-column mt-2">
		<div bind:this={logContent} class="logContent flex-fill overflow-auto">
			{#each session.log as entry, index (index)}
				<div
					class="logLine"
					class:text-danger={entry.level === 'error'}
					class:text-info={entry.level === 'notice'}
				>
					{entry.line}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
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

	.input-group-text {
		font-family: monospace;
		font-size: 0.85rem;
	}

	button > img {
		width: 1rem;
		height: 1rem;
	}

	.background {
		min-height: 0;
	}

	.vhosts-scroll {
		max-height: 100px;
		overflow-y: auto;
		flex-shrink: 0;
	}

	thead {
		position: sticky;
		top: 0;
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

	.logLine {
		font-family: monospace;
		font-size: 0.75rem;
		white-space: pre-wrap;
		word-break: break-all;
	}

	:global([data-bs-theme='light'] .logArea) {
		border-color: #c6c9cf;
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
		transition: all 0.2s ease;
	}
</style>
