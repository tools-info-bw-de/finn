export class Cable {
    uuid;
    endA;
    endB;
    currentlyTransmitting = [];
    isTransmitting = $derived(this.currentlyTransmitting.length > 0);
    constructor(uuid) {
        this.uuid = uuid;
    }
    connect(a, b) {
        this.endA = a;
        this.endB = b;
        a.cable = this;
        b.cable = this;
    }
    transmit(sender, frame) {
        this.currentlyTransmitting.push(frame);
        const receiver = sender === this.endA ? this.endB : this.endA;
        if (!receiver) {
            console.warn('No receiver connected to the cable.', this.uuid, this.endA, this.endB);
            return;
        }
        setTimeout(() => {
            this.currentlyTransmitting = this.currentlyTransmitting.filter((f) => f.uuid !== frame.uuid);
            receiver.receive(frame);
        }, 1000); // Simulate transmission delay
    }
}
