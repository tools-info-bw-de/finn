<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import type { ARPPacket } from '$lib/engine/types';
	import type { capturedPackage } from '$lib/engine/DataLinkLayer.svelte';
	import { nodes } from '$lib/states/nodes.svelte';

	let { nodeUuid, linkLayerUuid } = $props<{ nodeUuid: string; linkLayerUuid: string }>();

	let node = $derived.by(() => {
		return nodes.find((n) => n.uuid === nodeUuid);
	});

	let captureBuffer = $derived.by(() => {
		if (!node) return undefined;
		if (node.type === 'desktop' || node.type === 'notebook')
			return (node as Host).dataLinkLayer.captureBuffer;
		else if (node.type === 'router') {
			let n = node as Router;
			let iface = n.interfaces.find((iface) => iface.dataLinkLayer.uuid === linkLayerUuid);
			if (iface) {
				return iface.dataLinkLayer.captureBuffer;
			}
		}
	});

	function spyPacket(packet: capturedPackage) {
		let frame = packet.frame;
		let number = packet.number;
		let time = new Date(packet.time).toLocaleTimeString();

		let srcIp: string | undefined;
		let dstIp: string | undefined;
		let protocol: string | undefined;
		let detail: string | undefined;
		let layer: string | undefined;

		if (frame.header.type === 'ARP') {
			let arpPayload = frame.payload as ARPPacket;
			srcIp = arpPayload.senderIP;
			dstIp = arpPayload.targetIP;
			protocol = 'ARP';
			detail = arpPayload.type === 'request' ? 'ARP Request' : 'ARP Reply';
			layer = 'Vermittlung';
		}

		return { number, time, srcIp, dstIp, protocol, layer, detail };
	}
</script>

<table class="table table-sm table-striped table-hover">
	<thead>
		<tr>
			<th>Nr.</th>
			<th>Zeit</th>
			<th>Quelle</th>
			<th>Ziel</th>
			<th>Protokoll</th>
			<th>Schicht</th>
			<th>Bemerkungen / Details</th>
		</tr>
	</thead>
	<tbody>
		{#each captureBuffer as packet (packet.number)}
			{@const { number, time, srcIp, dstIp, protocol, layer, detail } = spyPacket(packet)}
			<tr>
				<td>{number}</td>
				<td>{time}</td>
				<td>{srcIp}</td>
				<td>{dstIp}</td>
				<td>{protocol}</td>
				<td>{layer}</td>
				<td>{detail}</td>
			</tr>
		{/each}
	</tbody>
</table>
