<script lang="ts">
	import { SwitchWifi } from '$lib/engine/SwitchWifi.svelte';

	let { switch_wifi }: { switch_wifi: SwitchWifi } = $props();
</script>

<!--Show SAT Table-->
<table class="table table-striped">
	<thead>
		<tr>
			<th scope="col">MAC</th>
			<th scope="col">Port</th>
			<th scope="col">Letzte Aktualisierung</th>
		</tr>
	</thead>
	<tbody>
		{#each Object.entries(switch_wifi.macTable) as [mac, entry] (entry.mac)}
			<tr>
				<td>{mac}</td>
				<td>{entry.port}</td>
				<td>{new Date(entry.updatedAt).toLocaleTimeString()}</td>
			</tr>
		{/each}
	</tbody>
</table>
