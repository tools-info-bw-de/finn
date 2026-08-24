// scripts/test-switch.ts
import { Host } from '../src/lib/engine/Host.svelte';
import { Switch } from '../src/lib/engine/Switch.svelte';
import { Cable } from '../src/lib/engine/Cable.svelte';

// 1. Geräte erzeugen
const pc1 = new Host('pc1', 'AA:AA:AA:AA:AA:11', '192.168.1.10', 'notebook');
const pc2 = new Host('pc2', 'BB:BB:BB:BB:BB:22', '192.168.1.20', 'desktop');
const pc3 = new Host('pc3', 'CC:CC:CC:CC:CC:33', '192.168.1.30', 'desktop');
const pc4 = new Host('pc4', 'DD:DD:DD:DD:DD:44', '192.168.1.40', 'notebook');

const sw1 = new Switch('Main-Switch');
const sw2 = new Switch('Secondary-Switch');

// 2. Verkabelung über den Switch
const cable1 = new Cable();
cable1.connect(pc1.dataLinkLayer, sw1.getPort());

const cable2 = new Cable();
cable2.connect(pc2.dataLinkLayer, sw1.getPort());

const cable3 = new Cable();
cable3.connect(pc3.dataLinkLayer, sw1.getPort());

const cable4 = new Cable();
cable4.connect(sw1.getPort(), sw2.getPort());

const cable5 = new Cable();
cable5.connect(pc4.dataLinkLayer, sw2.getPort());

console.log('--- STARTE PING VON PC1 ZU PC2 ---');
pc1.icmp.sendPing('192.168.1.40');

setTimeout(() => {
	console.log('\n=== MAC-TABELLE DES SWITCHES ===');
	console.log(sw1.macTable);

	console.log('\n=== LOGS PC 1 ===');
	console.log(pc1.icmp.logs);

	console.log('\n=== LOGS PC 4 ===');
	console.log(pc4.icmp.logs);

	console.log('\n=== CAPTURE BUFFER PC 3 (Sollte KEIN ICMP erhalten haben) ===');
	console.log(
		pc3.dataLinkLayer.captureBuffer.map(
			(f) => `${f.header.type}: ${f.header.srcMac} -> ${f.header.dstMac}`
		)
	);
}, 8000);
