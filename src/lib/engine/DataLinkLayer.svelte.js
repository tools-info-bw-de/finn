export class DataLinkLayer {
    config;
    cable;
    upperLayer;
    captureBuffer = $state([]);
    constructor(config) {
        this.config = config;
    }
    send(packet, destinationMac, type) {
        const frame = {
            uuid: crypto.randomUUID(),
            header: {
                srcMac: this.config.macAddress,
                dstMac: destinationMac,
                type
            },
            payload: packet
        };
        this.captureBuffer.push(frame);
        if (this.captureBuffer.length > 100) {
            this.captureBuffer.shift(); // Remove the oldest frame if buffer exceeds 100 frames
        }
        if (this.cable) {
            this.cable.transmit(this, frame);
        }
        else {
            console.warn('No cable connected to the DataLinkLayer.', this.config.macAddress);
        }
    }
    receive(frame) {
        this.captureBuffer.push(frame);
        if (this.captureBuffer.length > 100) {
            this.captureBuffer.shift(); // Remove the oldest frame if buffer exceeds 100 frames
        }
        if (frame.header.dstMac === this.config.macAddress ||
            frame.header.dstMac === 'ff:ff:ff:ff:ff:ff') {
            this.upperLayer?.receive(frame.payload, frame.header.type);
        }
    }
}
