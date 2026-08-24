import { DataLinkLayer } from './DataLinkLayer.svelte';
import { NetworkLayer } from './NetworkLayer';
import { ArpService } from './ArpService.svelte';
import type { NetworkNode } from './types';
import { HostConfig } from './HostConfig.svelte';
import { ICMPService } from './ICMPService.svelte';

// Ist entweder ein Notebook oder ein Rechner - wird nur durch den "type" unterschieden!
export class Host implements NetworkNode {
	public uuid: string = crypto.randomUUID();
	public name = $state<string>('');
	public config: HostConfig;
	public type: 'notebook' | 'desktop';
	public x = $state<number>(0);
	public y = $state<number>(0);

	public dataLinkLayer: DataLinkLayer;
	public arpService: ArpService;
	public networkLayer: NetworkLayer;

	public icmp: ICMPService;

	constructor(name: string, macAddress: string, ipAddress: string, type: 'notebook' | 'desktop') {
		this.name = name;
		this.config = new HostConfig(macAddress, ipAddress);
		this.type = type;
		this.x = 0;
		this.y = 0;

		this.dataLinkLayer = new DataLinkLayer(this.config);
		this.arpService = new ArpService(this.config, this.dataLinkLayer);
		this.networkLayer = new NetworkLayer(this.config, this.arpService);

		this.icmp = new ICMPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('ICMP', this.icmp);

		this.dataLinkLayer.upperLayer = this.networkLayer;
		this.networkLayer.lowerLayer = this.dataLinkLayer;
	}
}
