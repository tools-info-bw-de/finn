<script lang="ts">
	import hammer from '$lib/assets/hammer.svg';
	import play from '$lib/assets/play.svg';
	import letter_f from '$lib/assets/letter-f.png';
	import light from '$lib/assets/light.svg';
	import dark from '$lib/assets/dark.svg';
	import darklight from '$lib/assets/darklight.svg';
	import { settings } from '$lib/states/settings.svelte';
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import type { Host } from '$lib/engine/Host.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import { saveState, loadState, resetProject } from '$lib/engine/saveLoadState.svelte';
	import { newCable } from '$lib/states/cables.svelte';

	$effect(() => {
		if (settings.mode === 'play') {
			newCable.adding = false;
			newCable.uuids = [];

			emptyARPTables();
			editNode.uuid = '';
		}
	});

	function emptyARPTables() {
		for (const node of nodes) {
			if (node.type === 'notebook' || node.type === 'desktop') {
				(node as Host).networkLayer.arpService.emptyTable();
			} else if (node.type === 'router') {
				(node as Router).interfaces.forEach((iface) => {
					iface.networkLayer.arpService.emptyTable();
				});
			}
		}
	}

	function clickSave() {
		const state = saveState();

		// download the state as a JSON file
		const blob = new Blob([state], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'Netzwerk.finn';
		a.click();
		URL.revokeObjectURL(url);
	}

	function clickOpen() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.finn';
		input.onchange = (event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (e) => {
				const content = e.target?.result as string;
				loadState(content);
			};
			reader.readAsText(file);
		};
		input.click();
	}

	function newProject() {
		resetProject();
	}

	function clickAbout() {
		// TODO Modal
	}

	$effect(() => {
		if (settings.lightMode === 'auto') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			settings.theme = prefersDark ? 'dark' : 'light';
		} else {
			settings.theme = settings.lightMode;
		}
		document.documentElement.setAttribute('data-bs-theme', settings.theme);
	});
</script>

<nav class="navbar navbar-expand-lg navbar-layout">
	<div class="navbar-controls">
		<div class="btn-group mx-4">
			<button
				type="button"
				class="btn btn-warning"
				data-bs-toggle="modal"
				data-bs-target="#newProjectModal"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
					><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
						d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"
					/></svg
				>
				Neu
			</button>

			<button onclick={clickOpen} type="button" class="btn btn-warning ms-0 openBtn">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
					><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
						d="M88 289.6L64.4 360.2L64.4 160C64.4 124.7 93.1 96 128.4 96L267.1 96C280.9 96 294.4 100.5 305.5 108.8L343.9 137.6C349.4 141.8 356.2 144 363.1 144L480.4 144C515.7 144 544.4 172.7 544.4 208L544.4 224L179 224C137.7 224 101 250.4 87.9 289.6zM509.8 512L131 512C98.2 512 75.1 479.9 85.5 448.8L133.5 304.8C140 285.2 158.4 272 179 272L557.8 272C590.6 272 613.7 304.1 603.3 335.2L555.3 479.2C548.8 498.8 530.4 512 509.8 512z"
					/>
				</svg>
				Öffnen
			</button>

			<button onclick={clickSave} type="button" class="btn btn-warning ms-0">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
					><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
						d="M160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 237.3C544 220.3 537.3 204 525.3 192L448 114.7C436 102.7 419.7 96 402.7 96L160 96zM192 192C192 174.3 206.3 160 224 160L384 160C401.7 160 416 174.3 416 192L416 256C416 273.7 401.7 288 384 288L224 288C206.3 288 192 273.7 192 256L192 192zM320 352C355.3 352 384 380.7 384 416C384 451.3 355.3 480 320 480C284.7 480 256 451.3 256 416C256 380.7 284.7 352 320 352z"
					/>
				</svg>
				Speichern
			</button>
		</div>

		<div class="d-flex flex-row btn-group mx-4">
			<input
				type="radio"
				class="btn-check"
				name="mode"
				id="edit-mode"
				autocomplete="off"
				bind:group={settings.mode}
				value="edit"
			/>
			<label
				class="btn btn-outline-secondary d-flex flex-column align-items-center mode-label editLabel"
				class:active={settings.mode === 'edit'}
				for="edit-mode"
				><span class="edit-icon" style:--edit-icon={`url("${hammer}")`}></span>Entwurf</label
			>

			<input
				type="radio"
				class="btn-check"
				name="mode"
				id="play-mode"
				autocomplete="off"
				bind:group={settings.mode}
				value="play"
			/>
			<label
				class="btn btn-outline-primary d-flex flex-column align-items-center mode-label playLabel"
				class:active={settings.mode === 'play'}
				for="play-mode"
			>
				<span class="play-icon" style:--play-icon={`url("${play}")`}></span>
				Ausführen
			</label>
		</div>

		<div class="d-flex flex-column align-items-center">
			<label for="rangeSpeed" class="form-label"
				>Geschwindigkeit:
				<code>{settings.speed} %</code>
			</label>
			<input
				type="range"
				class="form-range"
				min="5"
				max="100"
				step="5"
				bind:value={settings.speed}
				id="rangeSpeed"
			/>
		</div>
	</div>

	<div class="finn mx-5">
		<img src={letter_f} width="48" height="48" alt="F" />
		<span>inn</span>
	</div>

	<div class="navbar-end me-4 d-flex flex-row gap-2">
		<div class="dropdown">
			<button
				class="btn btn-warning dropdown-toggle py-2"
				type="button"
				data-bs-toggle="dropdown"
				aria-expanded="false"
			>
				<img src={light} alt="Light" /> / <img src={dark} alt="Dark" />
			</button>
			<ul class="dropdown-menu">
				<li>
					<button
						type="button"
						class="btn btn-warning dropdown-item"
						class:active={settings.lightMode === 'light'}
						onclick={() => (settings.lightMode = 'light')}
						><span class="light-icon" style:--light-icon={`url("${light}")`}></span> Light</button
					>
				</li>

				<li>
					<button
						type="button"
						class="btn btn-warning dropdown-item"
						class:active={settings.lightMode === 'dark'}
						onclick={() => (settings.lightMode = 'dark')}
						><span class="dark-icon" style:--dark-icon={`url("${dark}")`}></span> Dark</button
					>
				</li>
				<li>
					<button
						type="button"
						class="btn btn-warning dropdown-item"
						class:active={settings.lightMode === 'auto'}
						onclick={() => (settings.lightMode = 'auto')}
						><span class="darklight-icon" style:--darklight-icon={`url("${darklight}")`}></span> Auto</button
					>
				</li>
			</ul>
		</div>

		<button onclick={clickAbout} type="button" class="btn btn-warning">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
				><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
					d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM288 224C288 206.3 302.3 192 320 192C337.7 192 352 206.3 352 224C352 241.7 337.7 256 320 256C302.3 256 288 241.7 288 224zM280 288L328 288C341.3 288 352 298.7 352 312L352 400L360 400C373.3 400 384 410.7 384 424C384 437.3 373.3 448 360 448L280 448C266.7 448 256 437.3 256 424C256 410.7 266.7 400 280 400L304 400L304 336L280 336C266.7 336 256 325.3 256 312C256 298.7 266.7 288 280 288z"
				/></svg
			>
			Über
		</button>
	</div>
</nav>

<div
	class="modal fade"
	id="newProjectModal"
	tabindex="-1"
	aria-labelledby="newProjectModalLabel"
	aria-hidden="true"
>
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content">
			<div class="modal-header">
				<h1 class="modal-title fs-5">Aktuelles Projekt löschen?</h1>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body">Möchtest du den aktuellen Zustand komplett löschen?</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
				<button type="button" class="btn btn-primary" onclick={newProject} data-bs-dismiss="modal"
					>Ja, neues Projekt starten</button
				>
			</div>
		</div>
	</div>
</div>

<style>
	.modal {
		background-color: rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(3px);
	}

	:global([data-bs-theme='dark'] .editLabel:not(.active)) {
		color: --var(--bs-secondary);
		filter: brightness(1.5);
	}

	.edit-icon {
		width: 2rem;
		height: 2rem;
		background-color: var(--bs-secondary);
		mask: var(--edit-icon) center / contain no-repeat;
		-webkit-mask: var(--edit-icon) center / contain no-repeat;
	}

	:global(.editLabel.active > .edit-icon) {
		background-color: white;
	}

	.play-icon {
		width: 2rem;
		height: 2rem;
		mask: var(--play-icon) center / contain no-repeat;
		-webkit-mask: var(--play-icon) center / contain no-repeat;
	}

	.play-icon {
		background-color: #fe5d3a;
	}

	.playLabel {
		border-color: #fe5d3a !important;
		color: #fe5d3a !important;
	}

	.playLabel.active {
		background-color: #fe5d3a !important;
		color: black !important;
	}

	:global(.playLabel.active > .play-icon) {
		background-color: black;
	}

	:global([data-bs-theme='light'] .playLabel) {
		color: black;
	}

	.openBtn {
		border-right: 1px solid black;
		border-left: 1px solid black;
	}

	.dropdown-menu {
		min-width: 0;
	}

	.dropdown > button {
		display: flex;
		height: inherit !important;
		flex-direction: row !important;
		align-items: center;
		gap: 0.2rem;
	}

	.dropdown-item {
		min-height: 0;
		height: inherit !important;
		display: flex;
		flex-direction: row !important;
		align-items: center;
		gap: 0.5rem;
	}

	:global(.light-icon) {
		background-color: var(--bs-warning);
		mask: var(--light-icon) center / contain no-repeat;
		-webkit-mask: var(--light-icon) center / contain no-repeat;
	}

	:global(.dark-icon) {
		background-color: var(--bs-warning);
		mask: var(--dark-icon) center / contain no-repeat;
		-webkit-mask: var(--dark-icon) center / contain no-repeat;
	}

	:global(.darklight-icon) {
		background-color: var(--bs-warning);
		mask: var(--darklight-icon) center / contain no-repeat;
		-webkit-mask: var(--darklight-icon) center / contain no-repeat;
	}

	:global(.dropdown-item.active > span) {
		background-color: black;
	}

	.dropdown-item.active {
		background-color: var(--bs-warning);
		color: var(--bs-dark);
	}

	.dropdown > button > img,
	.dropdown-item > span {
		width: 1.5rem;
		height: 1.5rem;
	}

	.navbar-layout {
		display: grid;
		grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
		align-items: center;
	}

	.navbar-controls {
		display: flex;
		flex-direction: row;
		justify-content: start;
		min-width: max-content;
	}

	.finn {
		grid-column: 2;
		display: flex;
		align-items: center;
		line-height: 0.8;
		font-size: 3.8rem;
		font-weight: bold;
		color: #3c709e;
		pointer-events: none;
		user-select: none;
	}

	.navbar-end {
		grid-column: 3;
		justify-self: end;
		align-items: center;
	}

	.finn > span {
		margin-left: -0.3rem;
		align-self: flex-end;
		padding: 0;
		background: linear-gradient(to bottom, #feb160, #fe171b);
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	code {
		padding: 0.2rem 0.4rem;
		box-shadow: inset 0 0 2px 3px rgba(0, 0, 0, 0.05);
		border-radius: 0.4rem;
		font-size: 1rem;
		font-weight: bold;
		background-color: #d6d6d6;
	}

	:global([data-bs-theme='dark'] code) {
		background-color: #363e49;
		color: #f3564b;
	}

	.btn-group button,
	.navbar-end button {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-width: 5rem;
		height: 4rem;
		padding: 0.2rem;
	}

	.btn-group button > svg {
		width: 2rem;
		height: 2rem;
	}

	.mode-label {
		min-width: 5.5rem;
		height: 4rem;
		padding: 0.2rem;
	}
</style>
