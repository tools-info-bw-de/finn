<script lang="ts">
	import { IPv4Pattern } from '$lib/engine/helpers';
	import { Host } from '$lib/engine/Host.svelte';

	let { host }: { host: Host } = $props();

	// svelte-ignore state_referenced_locally
	const session = host.dnsState();

	let newEntryType = $state<'A' | 'NS' | 'MX'>('A');
	let newADomain = $state('');
	let newAIP = $state('');
	let newNSDomain = $state('');
	let newNSServer = $state('');
	let newMXDomain = $state('');
	let newMXMailServer = $state('');

	function addEntry(event: SubmitEvent) {
		event.preventDefault();
		if (newEntryType === 'A') {
			if (newADomain.trim() === '' || newAIP.trim() === '') return;
			session.records.push({
				uuid: crypto.randomUUID(),
				type: 'A',
				domain: newADomain.trim(),
				ip: newAIP.trim()
			});
			newADomain = '';
			newAIP = '';
		} else if (newEntryType === 'NS') {
			if (newNSDomain.trim() === '' || newNSServer.trim() === '') return;
			session.records.push({
				uuid: crypto.randomUUID(),
				type: 'NS',
				domain: newNSDomain.trim(),
				nsDomain: newNSServer.trim()
			});
			newNSDomain = '';
			newNSServer = '';
		} else if (newEntryType === 'MX') {
			if (newMXDomain.trim() === '' || newMXMailServer.trim() === '') return;
			session.records.push({
				uuid: crypto.randomUUID(),
				type: 'MX',
				domain: newMXDomain.trim(),
				mxDomain: newMXMailServer.trim()
			});
			newMXDomain = '';
			newMXMailServer = '';
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
		}
	}
</script>

<div class="background p-2 flex-fill d-flex flex-column">
	<div class="d-flex flex-row justify-content-between align-items-center">
		<div
			class="form-check form-switch runningSwitch"
			style:border-color={session.serverRunning ? '#57c569' : '#c55757'}
			style:background-color={session.serverRunning ? '#57c56940' : '#c5575740'}
		>
			<input
				class="form-check-input"
				bind:checked={session.serverRunning}
				type="checkbox"
				role="switch"
				id="{host.uuid}-runningSwitch"
			/>
			<label class="form-check-label ms-2" for="{host.uuid}-runningSwitch"
				>Server {session.serverRunning ? 'läuft' : 'gestoppt'}</label
			>
		</div>
		<div class="form-check">
			<input
				bind:checked={session.recursiveResolution}
				class="form-check-input"
				type="checkbox"
				value=""
				id="{host.uuid}-checkDefault"
			/>
			<label class="form-check-label" for="{host.uuid}-checkDefault">
				Aktiviere rekursive Domain-Auflösung</label
			>
		</div>
	</div>

	<hr class="my-2" />

	<form onsubmit={addEntry}>
		<div class="d-flex flex-row align-items-center justify-space-between gap-2">
			<div class="form-floating">
				<select
					class="form-select"
					id="{host.uuid}-dnsType"
					aria-label="DNS Type"
					bind:value={newEntryType}
				>
					<option selected value="A">A (Adresse)</option>
					<option value="NS">NS (Name Server)</option>
					<option value="MX">MX (Mail Exchange)</option>
				</select>
				<label for="{host.uuid}-dnsType">DNS Record Typ</label>
			</div>
			{#if newEntryType === 'A'}
				<div class="form-floating">
					<input
						type="text"
						bind:value={newADomain}
						class="form-control"
						id="{host.uuid}-aDomain"
						placeholder="Host-/Domainname"
					/>
					<label for="{host.uuid}-aDomain">Host-/Domainname</label>
				</div>
				<div class="form-floating was-validated">
					<input
						type="text"
						bind:value={newAIP}
						class="form-control"
						id="{host.uuid}-aIP"
						pattern={IPv4Pattern}
						placeholder="IP-Adresse"
					/>
					<label for="{host.uuid}-aIP">IP-Adresse</label>
				</div>
			{:else if newEntryType === 'NS'}
				<div class="form-floating">
					<input
						type="text"
						bind:value={newNSDomain}
						class="form-control"
						id="{host.uuid}-nsDomain"
						placeholder="Domainname"
					/>
					<label for="{host.uuid}-nsDomain">Domainname</label>
				</div>
				<div class="form-floating">
					<input
						type="text"
						bind:value={newNSServer}
						class="form-control"
						id="{host.uuid}-nsServer"
						placeholder="Name Server"
					/>
					<label for="{host.uuid}-nsServer">Name Server</label>
				</div>
			{:else if newEntryType === 'MX'}
				<div class="form-floating">
					<input
						type="text"
						bind:value={newMXDomain}
						class="form-control"
						id="{host.uuid}-mxDomain"
						placeholder="Domainname"
					/>
					<label for="{host.uuid}-mxDomain">Domainname</label>
				</div>
				<div class="form-floating">
					<input
						type="text"
						bind:value={newMXMailServer}
						class="form-control"
						id="{host.uuid}-mxMailServer"
						placeholder="Mail Server"
						required
					/>
					<label for="{host.uuid}-mxMailServer">Mail Server</label>
				</div>
			{/if}
		</div>

		<div class="d-flex flex-row align-items-center justify-content-end mt-2">
			<button class="btn btn-primary btn-sm" type="submit">Eintrag hinzufügen</button>
		</div>
	</form>

	<hr class="my-2" />

	{#if session.records.length === 0}
		<div class="text-center">Noch keine Einträge vorhanden</div>
	{:else}
		<div class="records-scroll">
			<table class="table table-sm table-hover mb-0 table-bordered">
				<thead>
					<tr>
						<th scope="col">Typ</th>
						<th scope="col">Domain</th>
						<th scope="col">Wert</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each session.records as record (record.uuid)}
						<tr>
							<td>{record.type}</td>
							<td bind:textContent={record.domain} contenteditable onkeydown={handleKeyDown}></td>
							{#if record.type === 'A'}
								<td bind:textContent={record.ip} contenteditable onkeydown={handleKeyDown}></td>
							{:else if record.type === 'NS'}
								<td bind:textContent={record.nsDomain} contenteditable onkeydown={handleKeyDown}
								></td>
							{:else if record.type === 'MX'}
								<td bind:textContent={record.mxDomain} contenteditable onkeydown={handleKeyDown}
								></td>
							{/if}
							<td class="d-flex flex-column align-items-center mx-auto">
								<button
									class="btn btn-danger btn-sm"
									onclick={() =>
										(session.records = session.records.filter((r) => r.uuid !== record.uuid))}
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
										><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
											d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"
										/></svg
									></button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	button > svg {
		width: 1rem;
		height: 1rem;
	}

	.form-floating > input,
	select {
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

	.background {
		min-height: 0;
		overflow-y: auto;
	}

	.records-scroll {
		flex: 1 1 0;
		min-height: 150px;
		overflow-y: auto;
	}

	table {
		width: 100%;
	}

	thead {
		position: sticky;
		top: 0;
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

	.background {
		background-color: #1e1e1e;
		width: 100%;
		height: 100%;
	}
</style>
