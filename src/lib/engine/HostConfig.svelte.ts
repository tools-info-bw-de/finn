export class HostConfig {
	public macAddress = $state<string>('');
	public ipAddress = $state<string>('');
	public useIpAsName = $state<boolean>(false);

	constructor(macAddress: string, ipAddress: string) {
		this.macAddress = macAddress;
		this.ipAddress = ipAddress;
	}
}
