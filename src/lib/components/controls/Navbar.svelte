<script lang="ts">
	import hammer from '$lib/assets/hammer.svg';
	import play from '$lib/assets/play.svg';
	import { settings } from '$lib/states/settings.svelte';
</script>

<nav class="navbar navbar-expand-lg bg-light">
	<button type="button" class="btn btn-outline-primary"
		><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
			><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
				d="M160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 237.3C544 220.3 537.3 204 525.3 192L448 114.7C436 102.7 419.7 96 402.7 96L160 96zM192 192C192 174.3 206.3 160 224 160L384 160C401.7 160 416 174.3 416 192L416 256C416 273.7 401.7 288 384 288L224 288C206.3 288 192 273.7 192 256L192 192zM320 352C355.3 352 384 380.7 384 416C384 451.3 355.3 480 320 480C284.7 480 256 451.3 256 416C256 380.7 284.7 352 320 352z"
			/></svg
		></button
	>

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
</nav>

<style>
	button > svg,
	label > img {
		width: 2.5rem;
		height: 2.5rem;
	}
</style>
