<script lang="ts">
	import type { Host } from '$lib/engine/Host.svelte';
	import type { Router } from '$lib/engine/Router.svelte';
	import type {
		ARPPacket,
		EthernetFrame,
		ICMPPacket,
		IPPacket,
		TCPSegment,
		UDPDatagram
	} from '$lib/engine/types';
	import type { capturedPackage } from '$lib/engine/DataLinkLayer.svelte';
	import { nodes } from '$lib/states/nodes.svelte';
	import { getColorForProtocol } from '$lib/engine/helpers';
	import { tick } from 'svelte';

	let { nodeUuid, linkLayerUuid }: { nodeUuid: string; linkLayerUuid: string } = $props();

	let node = $derived.by(() => {
		return nodes.find((n) => n.uuid === nodeUuid);
	});

	// svelte-ignore state_referenced_locally
	let detailsNumber = $state<number | null>(
		(node as Host)?.dataLinkLayer?.captureBuffer.length ?? 0
	);

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

	function isDNSRecordType(value: unknown): value is 'A' | 'NS' | 'MX' {
		return value === 'A' || value === 'NS' || value === 'MX';
	}

	function isObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	let tableScroll = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (captureBuffer?.length && tableScroll) {
			tick().then(() => {
				// scrollIntoView würde auch Vorfahren horizontal verschieben
				tableScroll?.scrollTo({ top: tableScroll.scrollHeight, behavior: 'smooth' });
			});
		}
	});

	/**
	 * Erstellt eine kurze Zusammenfassung des Pakets FÜR DIE TABELLE.
	 * @param packet
	 */
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
						'Echo Request (ping), TTL=' + ipPacket.header.ttl + ', Seq.-No.: ' + icmpPacket.seq;
				} else if (icmpPacket.type === 'echo-reply') {
					detail =
						'Echo Reply (pong), TTL=' + ipPacket.header.ttl + ', Seq.-No.: ' + icmpPacket.seq;
				} else if (icmpPacket.type === 'time-exceeded') {
					detail = `Time Exceeded, TTL=${ipPacket.header.ttl}`;
					protocolColor = 'ERROR';
				} else if (icmpPacket.type === 'destination-unreachable') {
					detail = `Destination Unreachable (Ziel oder Dienst nicht erreichbar)`;
					protocolColor = 'ERROR';
				} else {
					detail = `ICMP Type ${icmpPacket.type}`;
				}
			} else if (ipPacket.header.protocol === 'UDP') {
				const udpDatagram = ipPacket.payload as UDPDatagram;
				srcIp = ipPacket.header.srcIp + ':' + udpDatagram.header.srcPort;
				dstIp = ipPacket.header.dstIp + ':' + udpDatagram.header.dstPort;
				protocol = 'UDP';
				layer = 'Transport';
				protocolColor = 'UDP';

				// Lies den Payload
				const payload = new TextDecoder().decode(udpDatagram.payload);
				const isDnsPacket = udpDatagram.header.srcPort === 53 || udpDatagram.header.dstPort === 53;
				let payloadObject: unknown;
				try {
					payloadObject = JSON.parse(payload);
				} catch {
					payloadObject = undefined;
				}

				if (isDnsPacket && isObject(payloadObject) && typeof payloadObject.name === 'string') {
					const name = payloadObject.name;
					protocol = 'DNS';
					layer = 'Anwendung';
					const recordType = payloadObject.recordType;
					if (payloadObject.kind === 'query' && isDNSRecordType(recordType)) {
						const labels = { A: 'IP-Adresse', NS: 'Nameserver', MX: 'Mailserver' };
						detail = `Suche ${labels[recordType]} für ${name}`;
					} else if (
						payloadObject.kind === 'response' &&
						isDNSRecordType(payloadObject.recordType)
					) {
						if (typeof payloadObject.error === 'string') {
							detail = payloadObject.error;
						} else if (
							payloadObject.recordType === 'A' &&
							typeof payloadObject.address === 'string'
						) {
							detail = `IP-Adresse für ${name} -> ${payloadObject.address}`;
						} else if (
							payloadObject.recordType === 'NS' &&
							typeof payloadObject.nsDomain === 'string'
						) {
							detail =
								`Nameserver für ${name} -> ${payloadObject.nsDomain}` +
								(payloadObject.glueIp ? ` (${payloadObject.glueIp})` : '');
						} else if (
							payloadObject.recordType === 'MX' &&
							typeof payloadObject.mxDomain === 'string'
						) {
							detail = `Mailserver für ${name} -> ${payloadObject.mxDomain}`;
						}
					}
				}
				detail ??= `UDP Datagram, ${udpDatagram.payload.length} Bytes: ${payload}`;
			} else if (
				ipPacket.header.protocol === 'TCP' &&
				(ipPacket.payload as TCPSegment).payload.length == 0
			) {
				const tcpSegment = ipPacket.payload as TCPSegment;
				srcIp = ipPacket.header.srcIp + ':' + tcpSegment.header.srcPort;
				dstIp = ipPacket.header.dstIp + ':' + tcpSegment.header.dstPort;
				protocol = 'TCP';
				layer = 'Transport';
				protocolColor = 'TCP';
				detail =
					(tcpSegment.header.flags.SYN && !tcpSegment.header.flags.ACK
						? 'Verbindungsaufbau ('
						: '') +
					(tcpSegment.header.flags.SYN && tcpSegment.header.flags.ACK
						? 'Bestätige & Verbindungsaufbau ('
						: '') +
					(tcpSegment.header.flags.FIN && tcpSegment.header.flags.ACK ? 'Verbindungsabbau (' : '') +
					(tcpSegment.header.flags.ACK &&
					!tcpSegment.header.flags.SYN &&
					!tcpSegment.header.flags.FIN &&
					!tcpSegment.header.flags.RST
						? 'Bestätige ('
						: '') +
					`Seq=${tcpSegment.header.seqNum}, Ack=${tcpSegment.header.ackNum}` +
					(tcpSegment.header.flags.SYN ? ', SYN' : '') +
					(tcpSegment.header.flags.ACK ? ', ACK' : '') +
					(tcpSegment.header.flags.FIN ? ', FIN' : '') +
					(tcpSegment.header.flags.RST ? ', RST' : '') +
					')';
			} else if (
				ipPacket.header.protocol === 'TCP' &&
				(ipPacket.payload as TCPSegment).payload.length > 0
			) {
				const tcpSegment = ipPacket.payload as TCPSegment;
				srcIp = ipPacket.header.srcIp + ':' + tcpSegment.header.srcPort;
				dstIp = ipPacket.header.dstIp + ':' + tcpSegment.header.dstPort;
				protocol = tcpSegment.header.protocol ?? '';
				layer = 'Anwendung';
				protocolColor = 'Anwendung';
				detail = new TextDecoder().decode(tcpSegment.payload);
			}
		}

		return { number, time, srcIp, dstIp, protocol, layer, detail, protocolColor };
	}

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

	// Eine Schicht des Pakets; "kind" legt fest, welcher Typ in "data" steckt
	type Layer =
		| { kind: 'ethernet'; data: EthernetFrame }
		| { kind: 'arp'; data: ARPPacket }
		| { kind: 'ip'; data: IPPacket }
		| { kind: 'icmp'; data: ICMPPacket }
		| { kind: 'udp'; data: UDPDatagram }
		| { kind: 'tcp'; data: TCPSegment }
		| { kind: 'application'; protocol: string; data: Uint8Array };

	type LayerPreview = {
		title: string;
		color: string; // Protokoll für getColorForProtocol
		from?: string | number;
		to?: string | number;
		endpointType?: string;
		inner?: Layer; // eingepackte Schicht -> wird rekursiv dargestellt
		text?: string; // Anwendungsdaten (innerste Schicht)
	};

	/** Kurzer Text für ein TCP-Segment ohne Anwendungsdaten (Auf-/Abbau, Bestätigung). */
	function TCPtoShortString(header: TCPSegment['header']): string {
		const { SYN, ACK, FIN, RST } = header.flags;
		const numbers = `Seq=${header.seqNum}, Ack=${header.ackNum}`;
		if (RST) return `Verbindung abgebrochen (RST)`;
		if (SYN && !ACK) return `Verbindungsaufbau (SYN)`;
		if (SYN && ACK) return `Bestätige & Verbindungsaufbau`;
		if (FIN) return `Verbindungsabbau`;
		if (ACK) return `Bestätigung`;
		return numbers;
	}

	/** Kurzer Text für eine DNS-Nachricht (JSON); leer, wenn sie nicht lesbar ist. */
	function DNStoShortString(payload: string): string {
		let data: unknown;
		try {
			data = JSON.parse(payload);
		} catch {
			return '';
		}
		if (!isObject(data) || typeof data.name !== 'string') return '';
		if (data.kind === 'response' && typeof data.error === 'string') {
			return `DNS-Fehler für ${data.name}: ${data.error}`;
		} else if (data.kind === 'query' && data.recordType === 'A') {
			return `Suche IP für ${data.name}`;
		} else if (data.kind === 'response' && data.recordType === 'A') {
			return `IP-Adresse für ${data.name} -> ${data.address}`;
		} else if (data.kind === 'query' && data.recordType === 'NS') {
			return `Suche Nameserver für ${data.name}`;
		} else if (data.kind === 'response' && data.recordType === 'NS') {
			return `Nameserver für ${data.name} -> ${data.nsDomain} ${data.glueIp ? '(' + data.glueIp + ')' : ''}`;
		} else if (data.kind === 'query' && data.recordType === 'MX') {
			return `Suche Mailserver für ${data.name}`;
		} else if (data.kind === 'response' && data.recordType === 'MX') {
			return `Mailserver für ${data.name} -> ${data.mxDomain}`;
		}

		return '';
	}

	/** Beschreibt eine Schicht und liefert die darin eingepackte nächste Schicht. */
	function describeLayer(layer: Layer): LayerPreview {
		switch (layer.kind) {
			case 'ethernet': {
				const { header, payload } = layer.data;
				return {
					title: 'Ethernet',
					color: 'Ethernet',
					from: header.srcMac,
					to: header.dstMac,
					endpointType: 'MAC',
					inner:
						header.type === 'ARP'
							? { kind: 'arp', data: payload as ARPPacket }
							: { kind: 'ip', data: payload as IPPacket }
				};
			}
			case 'arp': {
				const arp = layer.data;
				return {
					title: 'ARP',
					color: 'ARP',
					endpointType: 'IP',
					text:
						arp.type === 'request'
							? `${arp.senderIP} sucht MAC für ${arp.targetIP}`
							: `${arp.senderIP} hat MAC ${arp.senderMac}`
				};
			}
			case 'ip': {
				const { header, payload } = layer.data;
				let inner: Layer;
				if (header.protocol === 'TCP') inner = { kind: 'tcp', data: payload as TCPSegment };
				else if (header.protocol === 'UDP') inner = { kind: 'udp', data: payload as UDPDatagram };
				else inner = { kind: 'icmp', data: payload as ICMPPacket };
				return {
					title: 'IP',
					color: 'IP',
					from: header.srcIp,
					to: header.dstIp,
					endpointType: 'IP-Adresse',
					inner
				};
			}
			case 'icmp': {
				const icmp = layer.data;
				const isError = icmp.type !== 'echo-request' && icmp.type !== 'echo-reply';
				return {
					title: 'ICMP',
					text:
						icmp.type === 'echo-request'
							? 'Ping'
							: icmp.type === 'echo-reply'
								? 'Pong'
								: `ICMP Type ${icmp.type}`,
					color: isError ? 'ERROR' : 'ICMP'
				};
			}
			case 'udp': {
				const { header, payload } = layer.data;
				const isDns = header.srcPort === 53 || header.dstPort === 53;
				return {
					title: 'UDP',
					color: 'UDP',
					from: header.srcPort,
					to: header.dstPort,
					endpointType: 'Port',
					inner:
						payload.length > 0
							? { kind: 'application', protocol: isDns ? 'DNS' : 'Daten', data: payload }
							: undefined
				};
			}
			case 'tcp': {
				const { header, payload } = layer.data;
				return {
					title: 'TCP',
					color: 'TCP',
					from: header.srcPort,
					to: header.dstPort,
					endpointType: 'Port',
					inner:
						payload.length > 0
							? { kind: 'application', protocol: header.protocol ?? 'Daten', data: payload }
							: undefined,
					text: payload.length === 0 ? TCPtoShortString(header) : undefined
				};
			}
			case 'application': {
				const text = new TextDecoder().decode(layer.data);
				return {
					title: layer.protocol,
					color: 'Anwendung',
					text: (layer.protocol === 'DNS' && DNStoShortString(text)) || text
				};
			}
		}
	}

	type DetailSection = {
		title: string;
		rows: { label: string; value: string | number; block?: boolean }[];
	};

	/** Detail-Abschnitt (Schicht + Felder) einer einzelnen Paketschicht. */
	function layerDetails(layer: Layer): DetailSection {
		switch (layer.kind) {
			case 'ethernet': {
				const { header } = layer.data;
				return {
					title: 'Netzzugang (Ethernet)',
					rows: [
						{ label: 'Quell-MAC', value: header.srcMac },
						{ label: 'Ziel-MAC', value: header.dstMac }
					]
				};
			}
			case 'arp': {
				const arp = layer.data;
				return {
					title: 'Vermittlung (ARP)',
					rows: [
						{ label: 'Operation', value: arp.type === 'request' ? 'Request' : 'Reply' },
						{ label: 'Sender-IP', value: arp.senderIP },
						{ label: 'Sender-MAC', value: arp.senderMac },
						{ label: 'Ziel-IP', value: arp.targetIP },
						...(arp.targetMac ? [{ label: 'Ziel-MAC', value: arp.targetMac }] : [])
					]
				};
			}
			case 'ip': {
				const { header } = layer.data;
				return {
					title: 'Vermittlung (IP)',
					rows: [
						{ label: 'Quell-IP', value: header.srcIp },
						{ label: 'Ziel-IP', value: header.dstIp },
						{ label: 'TTL', value: header.ttl }
					]
				};
			}
			case 'icmp': {
				const icmp = layer.data;
				const original = icmp.original;
				return {
					title: 'Vermittlung (ICMP)',
					rows: [
						{ label: 'Typ', value: icmp.type },
						...(icmp.seq !== undefined ? [{ label: 'Seq.-Nr.', value: icmp.seq }] : []),
						...(original
							? [
									{
										label: 'Auslösendes Paket',
										value:
											original.protocol +
											(original.srcPort !== undefined
												? `, Port ${original.srcPort} -> ${original.dstPort}`
												: '') +
											(original.seq !== undefined ? `, Seq ${original.seq}` : '')
									}
								]
							: [])
					]
				};
			}
			case 'udp': {
				const { header } = layer.data;
				return {
					title: 'Transport (UDP)',
					rows: [
						{ label: 'Quell-Port', value: header.srcPort },
						{ label: 'Ziel-Port', value: header.dstPort }
					]
				};
			}
			case 'tcp': {
				const { header } = layer.data;
				const flags = (['SYN', 'ACK', 'FIN', 'RST'] as const).filter((f) => header.flags[f]);
				return {
					title: 'Transport (TCP)',
					rows: [
						{ label: 'Quell-Port', value: header.srcPort },
						{ label: 'Ziel-Port', value: header.dstPort },
						{ label: 'Seq.-Nr.', value: header.seqNum },
						{ label: 'Ack.-Nr.', value: header.ackNum },
						{ label: 'Flags', value: flags.length > 0 ? flags.join('+') : '–' }
					]
				};
			}
			case 'application': {
				if (layer.protocol === 'DNS') {
					const text = JSON.parse(new TextDecoder().decode(layer.data));
					let details = `${text.name} ${text.recordType} IN`;
					if (text.kind === 'query') {
						return {
							title: `Anwendung (${layer.protocol})`,
							rows: [
								{ label: 'Länge', value: `${details.length} Bytes` },
								{ label: `Details`, value: details, block: true }
							]
						};
					} else {
						let details = `${text.name} ${text.recordType} 3600 ${text.address ?? text.nsDomain ?? text.mxDomain} ${text.glueIp ? '\n' + text.nsDomain + ' A 3600 ' + text.glueIp : ''}`;
						return {
							title: `Anwendung (${layer.protocol})`,
							rows: [
								{ label: 'Länge', value: `${details.length} Bytes` },
								{
									label: `Details`,
									value: details,
									block: true
								}
							]
						};
					}
				} else {
					return {
						title: `Anwendung (${layer.protocol})`,
						rows: [
							{ label: 'Länge', value: `${layer.data.length} Bytes` },
							{ label: 'Inhalt', value: new TextDecoder().decode(layer.data), block: true }
						]
					};
				}
			}
		}
	}

	/** Alle Schichten des Frames von außen nach innen als Detail-Abschnitte. */
	function packetDetails(frame: EthernetFrame): DetailSection[] {
		const sections: DetailSection[] = [];
		let layer: Layer | undefined = { kind: 'ethernet', data: frame };
		while (layer) {
			sections.push(layerDetails(layer));
			layer = describeLayer(layer).inner;
		}
		return sections;
	}

	let selectedPacket = $derived(captureBuffer?.find((p) => p.number === detailsNumber));
</script>

{#snippet packagePreview(layer: Layer)}
	{@const preview = describeLayer(layer)}
	<div class="package" style="border-color: {getColorForProtocol(preview.color)};">
		<div
			class="p-header"
			style="background-color: {getColorForProtocol(preview.color)}; {preview.color === 'UDP'
				? 'color: black !important;'
				: ''}"
		>
			{preview.title}
			{#if preview.endpointType}<span class="p-info">({preview.endpointType})</span>{/if}
		</div>
		<div class="p-body">
			{#if preview.from !== undefined || preview.to !== undefined}
				<div class="endpoints {preview.text !== undefined ? 'divider' : ''}">
					<span>{preview.from ?? '–'}</span>
					<div class="divider"></div>
					<span>{preview.to ?? '–'}</span>
				</div>
			{/if}
			{#if preview.inner}
				{@render packagePreview(preview.inner)}
			{:else if preview.text !== undefined}
				<pre class="p-payload">{preview.text}</pre>
			{/if}
		</div>
	</div>
{/snippet}

<div class="sniffer background" bind:this={snifferEl}>
	<div class="table-scroll" bind:this={tableScroll}>
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
			<tbody>
				{#each captureBuffer as packet (packet.number)}
					{@const { number, time, srcIp, dstIp, protocol, layer, detail, protocolColor } =
						spyPacket(packet)}
					<tr
						style="background-color: {getColorForProtocol(protocolColor)}70; {protocolColor ===
						'UDP'
							? 'color: black !important;'
							: ''}"
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

	<!-- Vorschau + Details bilden gemeinsam den in der Höhe veränderbaren Bereich unter dem Griff -->
	<div class="lower" style="height: {detailsHeight}px;">
		{#if selectedPacket}
			<div class="packagePreview">
				{@render packagePreview({ kind: 'ethernet', data: selectedPacket.frame })}
			</div>
		{/if}

		<div class="details">
			{#if selectedPacket}
				Nr.: {selectedPacket.number} / Zeit: {new Date(selectedPacket.time).toLocaleTimeString()}

				<!-- Ein flaches Grid mit zwei Spalten (Bezeichnung | Wert) -> alle Werte stehen in einer Flucht -->
				<div class="details-grid">
					{#each packetDetails(selectedPacket.frame) as section (section.title)}
						<div class="section-title">{section.title}:</div>
						{#each section.rows as row (row.label)}
							<div class="row-label">{row.label}:</div>
							{#if row.block}
								<pre class="p-payload row-value">{row.value}</pre>
							{:else}
								<div class="row-value">{row.value}</div>
							{/if}
						{/each}
					{/each}
				</div>
			{/if}
		</div>
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

	.lower {
		flex: none;
		display: flex;
		flex-direction: row;
		min-height: 0;
	}

	.details {
		font-size: 0.9rem;
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.25rem 0.5rem;
	}

	.details-grid {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		column-gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.section-title {
		grid-column: 1 / -1;
		font-weight: bold;
	}

	.row-label {
		grid-column: 1;
		padding-left: 1rem;
	}

	.row-value {
		grid-column: 2;
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.details-handle {
		flex: none;
		height: 6px;
		background: #45475a;
		cursor: row-resize;
		touch-action: none;
	}

	th,
	td {
		font-size: 0.85rem;
		padding: 0.1rem 0.1rem;
	}

	th {
		border-right: 1px solid #bec3c7c7;
	}

	tr {
		color: white;
	}

	td {
		background-color: inherit;
		text-wrap: nowrap;
		border-right: 1px solid #dee2e659;
		color: inherit;
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
	.packagePreview {
		flex: none;
		overflow: auto;
		padding: 0.25rem 0.5rem;
		font-size: 0.85rem;
		width: 270px;
	}

	.package {
		border: 3px solid;
		border-radius: 4px;
		background-color: #ffffff;
		color: #11111b;
	}

	.p-header {
		color: #fff;
		font-weight: bold;
		padding: 0 0.4rem;
	}

	.p-info {
		font-weight: normal;
		margin-left: 0.5rem;
	}

	.p-body {
		display: flex;
		flex-direction: column;
		/* gap: 0.25rem; */
		padding: 0 0.4rem;
	}

	/* Zwei gleich breite Hälften -> der Trennstrich sitzt unabhängig von der Textlänge genau mittig */
	.endpoints {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		padding: 0 0.1rem;
	}

	.endpoints .divider {
		border-right: 1px solid #45475a;
	}

	.endpoints span {
		margin: 0 0.25rem;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.p-payload {
		margin: 0;
		max-height: 3rem;
		max-width: 15rem;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
		word-wrap: anywhere;
		font-size: 0.8rem;
		align-self: center;
	}
</style>
