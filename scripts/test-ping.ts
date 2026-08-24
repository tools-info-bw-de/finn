// scripts/test-ping.ts
import { Host } from '../src/lib/engine/Host';
import { Cable } from '../src/lib/engine/Cable.svelte';

// 1. Zwei Rechner (Hosts) erstellen
const pc1 = new Host('pc1', 'AA:AA:AA:AA:AA:11', '192.168.1.10', 'notebook');
const pc2 = new Host('pc2', 'BB:BB:BB:BB:BB:22', '192.168.1.20', 'desktop');

// 2. Kabel anlegen und Datenlinks verbinden
const cable = new Cable();
cable.connect(pc1.dataLinkLayer, pc2.dataLinkLayer);

console.log('--- STARTING NETWORK SIMULATION ---');

// 3. PC1 pingt PC2 an (triggert ARP -> ARP Reply -> Ping Request -> Ping Reply)
pc1.icmp.sendPing('192.168.1.20');

// 4. Da die Kabel-Übertragung asynchron per setTimeout (50ms) läuft, verzögert ausgeben:
setTimeout(() => {
	console.log('\n=== LOGS PC 1 ===');
	pc1.icmp.logs.forEach((log) => console.log(`[PC1] ${log}`));

	console.log('\n=== ARP-TABELLE PC 1 ===');
	console.log(pc1.arpService.table);

	console.log('\n=== CAPTURED FRAMES (PC 1) ===');
	pc1.dataLinkLayer.captureBuffer.forEach((f) => {
		console.log(f.header);
	});
}, 4500);
