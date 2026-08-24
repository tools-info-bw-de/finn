export class HostConfig {
	public macAddress = $state<string>('');
	public ipAddress = $state<string>('');

	constructor(macAddress: string, ipAddress: string) {
		this.macAddress = macAddress;
		this.ipAddress = ipAddress;
	}
}
