export class NetworkConfig {
	public macAddress = $state<string>('');
	public ipAddress = $state<string>('');
	//public useIpAsName = $state<boolean>(false);
	public netmask = $state<string>('');

	constructor(macAddress: string, ipAddress: string, netmask: string) {
		this.macAddress = macAddress;
		this.ipAddress = ipAddress;
		this.netmask = netmask;
	}
}
