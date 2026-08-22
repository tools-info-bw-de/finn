export class HostConfig {
    uuid;
    name = $state('');
    macAddress = $state('');
    ipAddress = $state('');
    constructor(name, macAddress, ipAddress) {
        this.uuid = crypto.randomUUID();
        this.name = name;
        this.macAddress = macAddress;
        this.ipAddress = ipAddress;
    }
}
