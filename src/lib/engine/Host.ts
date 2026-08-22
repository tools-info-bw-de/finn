import { DataLinkLayer } from './DataLinkLayer.svelte';
import { NetworkLayer } from './NetworkLayer';
import { ArpService } from './ArpService.svelte';
import type { NetworkNode } from './types';
import { HostConfig } from './HostConfig.svelte';
import { ICMPService } from './ICMPService.svelte';

export class Host implements NetworkNode {
	public config: HostConfig;
	public type: 'host';

	public dataLinkLayer: DataLinkLayer;
	public arpService: ArpService;
	public networkLayer: NetworkLayer;

	public icmp: ICMPService;

	constructor(name: string, macAddress: string, ipAddress: string) {
		this.config = new HostConfig(name, macAddress, ipAddress);
		this.type = 'host';

		this.dataLinkLayer = new DataLinkLayer(this.config);
		this.arpService = new ArpService(this.config, this.dataLinkLayer);
		this.networkLayer = new NetworkLayer(this.config, this.arpService);

		this.icmp = new ICMPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('ICMP', this.icmp);
	}
}
