export class NetworkLayer {
    config;
    arpService;
    upperLayer;
    lowerLayer;
    // Register protocol handlers for ICMP, UDP, and TCP
    protocolHandlers = new Map();
    registerProtocolHandler(protocol, handler) {
        this.protocolHandlers.set(protocol, handler);
    }
    constructor(config, arpService) {
        this.config = config;
        this.arpService = arpService;
    }
    send(payload, destinationIp, protocol) {
        if (!this.lowerLayer)
            return;
        const ipPacket = {
            header: {
                srcIp: this.config.ipAddress,
                dstIp: destinationIp,
                protocol,
                ttl: 64 // Default TTL value
            },
            payload
        };
        this.arpService.resolve(destinationIp, ipPacket, (macAddress) => {
            this.lowerLayer?.send(ipPacket, macAddress, 'IP');
        });
    }
    receive(packet, type) {
        if (type === 'ARP') {
            this.arpService.handlePacket(packet, (pendingPacket, mac) => {
                this.lowerLayer?.send(pendingPacket, mac, 'IP');
            });
            return;
        }
        // otherwise it's an IP packet
        const ipPacket = packet;
        // reduce ttl
        ipPacket.header.ttl--;
        if (ipPacket.header.dstIp === this.config.ipAddress ||
            ipPacket.header.dstIp === '255.255.255.255') {
            const handler = this.protocolHandlers.get(ipPacket.header.protocol);
            if (handler) {
                handler.receive(ipPacket.payload, ipPacket.header.srcIp);
            }
        }
        else if (ipPacket.header.ttl == 0) {
            const icmpPacket = {
                type: 'time-exceeded'
            };
            this.send(icmpPacket, ipPacket.header.srcIp, 'ICMP');
            console.warn(`IP packet dropped due to TTL=0. Packet from ${ipPacket.header.srcIp} to ${ipPacket.header.dstIp}`);
        }
        else {
            console.warn(`IP packet not for this device. Expected ${this.config.ipAddress}, got ${ipPacket.header.dstIp}`);
        }
    }
}
