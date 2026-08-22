export class HostConfig {
	public uuid: string;
	public name = $state<string>('');
	public macAddress = $state<string>('');
	public ipAddress = $state<string>('');

	constructor(name: string, macAddress: string, ipAddress: string) {
		this.uuid = crypto.randomUUID();
		this.name = name;
		this.macAddress = macAddress;
		this.ipAddress = ipAddress;
	}
}
