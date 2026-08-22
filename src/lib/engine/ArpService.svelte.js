import { SvelteMap } from 'svelte/reactivity';
// ARP-Services für ein Gerät inkl. ARP-Cache und Warteschlange für ausstehende IP-Pakete, die auf die Auflösung warten
export class ArpService {
    config;
    dataLink;
    table = $state({}); // Maps IP addresses to MAC addresses
    pendingQueue = new SvelteMap(); // Maps IP addresses to queued IP packets
    constructor(config, dataLink) {
        this.config = config;
        this.dataLink = dataLink;
    }
    resolve(dstIp, ipPacket, onResolved) {
        const cachedMac = this.table[dstIp];
        if (cachedMac) {
            onResolved(cachedMac);
            return;
        }
        // Not in cache, send ARP request
        if (!this.pendingQueue.has(dstIp)) {
            this.pendingQueue.set(dstIp, []);
        }
        this.pendingQueue.get(dstIp).push(ipPacket);
        this.sendRequest(dstIp);
    }
    handlePacket(arpPacket, onPacketReadyToDeliver) {
        // Update ARP table with the sender's MAC address
        this.table[arpPacket.senderIP] = arpPacket.senderMac;
        // answer request
        if (arpPacket.type === 'request' && arpPacket.targetIP === this.config.ipAddress) {
            const arpReply = {
                type: 'reply',
                senderIP: this.config.ipAddress,
                senderMac: this.config.macAddress,
                targetIP: arpPacket.senderIP,
                targetMac: arpPacket.senderMac
            };
            this.dataLink.send(arpReply, arpPacket.senderMac, 'ARP');
        }
        // otherwise it's a reply, so we can send any queued packets
        if (arpPacket.type === 'reply' && arpPacket.targetIP === this.config.ipAddress) {
            const pendingPackets = this.pendingQueue.get(arpPacket.senderIP) || [];
            for (const pendingPacket of pendingPackets) {
                onPacketReadyToDeliver(pendingPacket, arpPacket.senderMac);
            }
            this.pendingQueue.delete(arpPacket.senderIP);
        }
    }
    sendRequest(targetIp) {
        const arpRequest = {
            type: 'request',
            senderIP: this.config.ipAddress,
            senderMac: this.config.macAddress,
            targetIP: targetIp
        };
        this.dataLink.send(arpRequest, 'ff:ff:ff:ff:ff:ff', 'ARP'); // Broadcast MAC address
    }
}
