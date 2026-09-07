export class NetworkConfig {
	public macAddress = $state<string>('');
	public ipAddress = $state<string>('');
	public netmask = $state<string>('');
	public gateway = $state<string>('');

	constructor(macAddress: string, ipAddress: string, netmask: string) {
		this.macAddress = macAddress;
		this.ipAddress = ipAddress;
		this.netmask = netmask;
	}
}
