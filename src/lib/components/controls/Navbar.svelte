<script lang="ts">
	import hammer from '$lib/assets/hammer.svg';
	import play from '$lib/assets/play.svg';
	import { settings } from '$lib/states/settings.svelte';
	import { nodes, editNode } from '$lib/states/nodes.svelte';
	import type { Host } from '$lib/engine/Host.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import { saveState, loadState } from '$lib/engine/saveLoadState.svelte';

	$effect(() => {
		if (settings.mode === 'play') {
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
</script>

<nav class="navbar navbar-expand-lg bg-light">
	<button onclick={clickSave} type="button" class="btn btn-outline-primary ms-4">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
			><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
				d="M160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 237.3C544 220.3 537.3 204 525.3 192L448 114.7C436 102.7 419.7 96 402.7 96L160 96zM192 192C192 174.3 206.3 160 224 160L384 160C401.7 160 416 174.3 416 192L416 256C416 273.7 401.7 288 384 288L224 288C206.3 288 192 273.7 192 256L192 192zM320 352C355.3 352 384 380.7 384 416C384 451.3 355.3 480 320 480C284.7 480 256 451.3 256 416C256 380.7 284.7 352 320 352z"
			/>
		</svg>
	</button>

	<button onclick={clickOpen} type="button" class="btn btn-outline-primary ms-2 me-4">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
			><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
				d="M88 289.6L64.4 360.2L64.4 160C64.4 124.7 93.1 96 128.4 96L267.1 96C280.9 96 294.4 100.5 305.5 108.8L343.9 137.6C349.4 141.8 356.2 144 363.1 144L480.4 144C515.7 144 544.4 172.7 544.4 208L544.4 224L179 224C137.7 224 101 250.4 87.9 289.6zM509.8 512L131 512C98.2 512 75.1 479.9 85.5 448.8L133.5 304.8C140 285.2 158.4 272 179 272L557.8 272C590.6 272 613.7 304.1 603.3 335.2L555.3 479.2C548.8 498.8 530.4 512 509.8 512z"
			/>
		</svg>
	</button>

	<div class="d-flex flex-row gap-2">
		<input
			type="radio"
			class="btn-check"
			name="mode"
			id="edit-mode"
			autocomplete="off"
			bind:group={settings.mode}
			value="edit"
		/>
		<label class="btn btn-outline-success" for="edit-mode"><img src={hammer} alt="edit" /></label>

		<input
			type="radio"
			class="btn-check"
			name="mode"
			id="play-mode"
			autocomplete="off"
			bind:group={settings.mode}
			value="play"
		/>
		<label class="btn btn-outline-danger" for="play-mode"><img src={play} alt="play" /></label>
	</div>

	<div class="d-flex flex-column mx-5 align-items-center">
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
</nav>

<style>
	code {
		padding: 0.2rem 0.4rem;
		box-shadow: inset 0 0 2px 3px rgba(0, 0, 0, 0.05);
		border-radius: 0.4rem;
		font-size: 1rem;
		font-weight: bold;
		background-color: #d6d6d6;
	}

	button > svg,
	label > img {
		width: 2.5rem;
		height: 2.5rem;
	}
</style>
