import { ArpService } from './ArpService.svelte';
import { NetworkLayer } from './NetworkLayer';
import { NetworkConfig } from './NetworkConfig.svelte';
import { generateRandomMac } from './helpers';
import { DataLinkLayer } from './DataLinkLayer.svelte';
import { ICMPService } from './ICMPService.svelte';

export class RouterInterface {
	public uuid: string = crypto.randomUUID();
	public config: NetworkConfig;
	public dataLinkLayer: DataLinkLayer;
	public arpService: ArpService;
	public networkLayer: NetworkLayer;
	public icmp: ICMPService;

	constructor() {
		this.config = new NetworkConfig(generateRandomMac(), '192.168.0.10', '255.255.255.0');
		this.dataLinkLayer = new DataLinkLayer(this.config);
		this.arpService = new ArpService(this.config, this.dataLinkLayer);
		this.networkLayer = new NetworkLayer(this.config, this.arpService, true);
		this.icmp = new ICMPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('ICMP', this.icmp);

		this.dataLinkLayer.upperLayer = this.networkLayer;
		this.networkLayer.lowerLayer = this.dataLinkLayer;
	}
}
