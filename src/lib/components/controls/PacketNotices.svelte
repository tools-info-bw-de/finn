<script lang="ts">
	import { SimulationEventBus } from '$lib/engine/SimulationEventBus';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	type Notice = { id: number; message: string };
	let notices = $state<Notice[]>([]);
	const timers = new SvelteMap<number, ReturnType<typeof setTimeout>>();
	let nextId = 0;

	function dismiss(id: number) {
		const timer = timers.get(id);
		if (timer) clearTimeout(timer);
		timers.delete(id);
		notices = notices.filter((notice) => notice.id !== id);
	}

	function clearNotices() {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		notices = [];
	}

	onMount(() => {
		const unsubscribe = SimulationEventBus.getInstance().onNotice((message) => {
			if (message === undefined) {
				clearNotices();
				return;
			}
			const id = nextId++;
			notices.push({ id, message });
			timers.set(
				id,
				setTimeout(() => dismiss(id), 10000)
			);
		});
		return () => {
			unsubscribe();
			clearNotices();
		};
	});
</script>

<div class="toast-container" aria-live="polite" aria-relevant="additions">
	{#each notices as notice (notice.id)}
		<div class="toast show" role="status" aria-atomic="true">
			<div class="d-flex flex-row align-items-center">
				<div class="toast-body">{notice.message}</div>
				<button
					type="button"
					class="btn-close me-2"
					aria-label="Benachrichtigung schließen"
					onclick={() => dismiss(notice.id)}
				></button>
			</div>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		z-index: 10000;
		width: min(350px, calc(100% - 2rem));
		max-height: calc(100% - 2rem);
		overflow-y: auto;
		pointer-events: none;
		cursor: default;
	}

	.toast {
		background-color: rgb(from var(--bs-danger) r g b / 0.5);
		backdrop-filter: blur(5px);
		border: 1px solid var(--bs-danger);
		width: 100%;
		pointer-events: auto;
	}
</style>
