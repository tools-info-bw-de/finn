<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import type { ARPPacket, ICMPPacket, IPPacket } from '$lib/engine/types';
	import type { capturedPackage } from '$lib/engine/DataLinkLayer.svelte';
	import { nodes } from '$lib/states/nodes.svelte';
	import { getColorForProtocol } from '$lib/engine/helpers';
	import { tick } from 'svelte';

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

	let tableBody = $state<HTMLTableSectionElement | null>(null);
	$effect(() => {
		if (captureBuffer?.length) {
			if (tableBody) {
				tick().then(() => {
					const lastRow = tableBody?.lastElementChild;
					if (lastRow) {
						lastRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
					}
				});
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
		let protocolColor: string | undefined; // Eigene Protokoll-Definition für die Farbe des Zeilenhintergrunds

		if (frame.header.type === 'ARP') {
			let arpPayload = frame.payload as ARPPacket;
			srcIp = arpPayload.senderIP;
			dstIp = arpPayload.targetIP;
			protocol = 'ARP';
			if (arpPayload.type === 'request') {
				detail =
					'Suche nach MAC für IP ' +
					arpPayload.targetIP +
					' [op=REQUEST, sender=' +
					arpPayload.senderMac +
					' (' +
					arpPayload.senderIP +
					')' +
					', target=' +
					frame.header.dstMac +
					' (' +
					arpPayload.targetIP +
					')' +
					']';
			} else {
				detail =
					'MAC ist ' +
					arpPayload.senderMac +
					' [op=REPLY, sender=' +
					arpPayload.senderMac +
					' (' +
					arpPayload.senderIP +
					')' +
					', target=' +
					frame.header.dstMac +
					' (' +
					arpPayload.targetIP +
					')' +
					']';
			}
			layer = 'Vermittlung';
			protocolColor = 'ARP';
		} else if (frame.header.type === 'IP') {
			const ipPacket = frame.payload as IPPacket;

			if (ipPacket.header.protocol === 'ICMP') {
				const icmpPacket = ipPacket.payload as ICMPPacket;
				srcIp = ipPacket.header.srcIp;
				dstIp = ipPacket.header.dstIp;
				protocol = 'ICMP';
				layer = 'Vermittlung';
				protocolColor = 'ICMP';

				if (icmpPacket.type === 'echo-request') {
					detail =
						'ICMP Echo Request (ping), TTL=' +
						ipPacket.header.ttl +
						', Seq.-No.: ' +
						icmpPacket.seq;
				} else if (icmpPacket.type === 'echo-reply') {
					detail =
						'ICMP Echo Reply (pong), TTL=' + ipPacket.header.ttl + ', Seq.-No.: ' + icmpPacket.seq;
				} else {
					detail = `ICMP Type ${icmpPacket.type}`;
					protocolColor = 'ERROR'; // Fehlerhafte ICMP-Pakete (z.B. Time Exceeded, Destination Unreachable) werden rot markiert
				}
			}
		}

		return { number, time, srcIp, dstIp, protocol, layer, detail, protocolColor };
	}

	let detailsNumber = $state<number | null>(1);

	let snifferEl = $state<HTMLDivElement | null>(null);
	let detailsHeight = $state(150);
	let resizing = false;

	function startResize(e: PointerEvent) {
		e.stopPropagation();
		resizing = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function doResize(e: PointerEvent) {
		if (!resizing || !snifferEl) return;
		const rect = snifferEl.getBoundingClientRect();
		// Tabelle und Details behalten jeweils mindestens 60px
		detailsHeight = Math.min(Math.max(rect.bottom - e.clientY, 60), rect.height - 60);
	}

	function stopResize(e: PointerEvent) {
		resizing = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}
</script>

<div class="sniffer" bind:this={snifferEl}>
	<div class="table-scroll">
		<table class="table table-sm table-hover">
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
			<tbody bind:this={tableBody}>
				{#each captureBuffer as packet (packet.number)}
					{@const { number, time, srcIp, dstIp, protocol, layer, detail, protocolColor } =
						spyPacket(packet)}
					<tr
						style="background-color: {getColorForProtocol(protocolColor)}70;"
						onclick={() => (detailsNumber = number)}
					>
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
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="details-handle"
		onpointerdown={startResize}
		onpointermove={doResize}
		onpointerup={stopResize}
	></div>

	<div class="details" style="height: {detailsHeight}px;">
		{#if detailsNumber !== null}
			{@const packet = captureBuffer?.find((p) => p.number === detailsNumber)}
			{#if packet}
				<h3>Details for Packet {packet.number}</h3>
				<p>{JSON.stringify(packet, null, 2)}</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.sniffer {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.table-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.details {
		flex: none;
		overflow: auto;
		padding: 0.25rem 0.5rem;
	}

	.details-handle {
		flex: none;
		height: 6px;
		background: #45475a;
		cursor: row-resize;
		touch-action: none;
	}

	.details p {
		white-space: pre-wrap;
	}

	th,
	td {
		font-size: 0.9rem;
		padding: 0.1rem 0.1rem;
	}

	th {
		border-right: 1px solid #bec3c7c7;
	}

	td {
		background-color: inherit;
		text-wrap: nowrap;
		border-right: 1px solid #dee2e659;
	}

	table {
		background-color: white;
		width: 100%;
		min-width: max-content;
	}

	/* 1% + nowrap: Spalte schrumpft auf Inhaltsbreite, die letzte nimmt den Rest */
	th:not(:last-child),
	td:not(:last-child) {
		width: 1%;
		white-space: nowrap;
	}
</style>
