import { DataLinkLayer } from './DataLinkLayer.svelte';
import { NetworkLayer } from './NetworkLayer';
import { ArpService } from './ArpService.svelte';
import type { App, AppName, AppType, NetworkNode, TerminalState } from './types';
import { NetworkConfig } from './NetworkConfig.svelte';
import { ICMPService } from './ICMPService.svelte';
import { nodeSpawn } from '$lib/states/nodes.svelte';

function createApp(type: AppType): App {
	if (type === 'terminal') {
		return {
			type,
			content: {
				history: [],
				historyIndex: -1,
				draftInput: '',
				inputBuffer: '',
				cursorPos: 0,
				screen: null,
				running: false
			}
		};
	}
	return { type, content: null };
}

// Ist entweder ein Notebook oder ein Rechner - wird nur durch den "type" unterschieden!
export class Host implements NetworkNode {
	public uuid: string = crypto.randomUUID();
	public name = $state<string>('');
	public config: NetworkConfig;
	public useIpAsName = $state<boolean>(false);
	public type: 'notebook' | 'desktop';
	public x = $state<number>(0);
	public y = $state<number>(0);

	public apps = $state<App[]>([]);
	public currentApp = $state<AppName>('');

	public dataLinkLayer: DataLinkLayer;
	public arpService: ArpService;
	public networkLayer: NetworkLayer;

	public icmp: ICMPService;

	constructor(
		name: string,
		macAddress: string,
		ipAddress: string,
		netmask: string,
		type: 'notebook' | 'desktop'
	) {
		this.name = name;
		this.config = new NetworkConfig(macAddress, ipAddress, netmask);
		this.type = type;
		this.x = nodeSpawn.x;
		this.y = nodeSpawn.y;

		this.dataLinkLayer = new DataLinkLayer(this.config);
		this.arpService = new ArpService(this.config, this.dataLinkLayer);
		this.networkLayer = new NetworkLayer(this.config, this.arpService);

		this.icmp = new ICMPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('ICMP', this.icmp);

		this.dataLinkLayer.upperLayer = this.networkLayer;
		this.networkLayer.lowerLayer = this.dataLinkLayer;
	}

	public openApp(type: AppType): void {
		if (!this.apps.some((app) => app.type === type)) {
			this.apps.push(createApp(type));
		}
		this.currentApp = type;
	}

	// Entfernt die aktuelle App samt ihrem Zustand
	public closeCurrentApp(): void {
		this.apps = this.apps.filter((app) => app.type !== this.currentApp);
		this.currentApp = '';
	}

	public terminalState(): TerminalState {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'terminal' }> => a.type === 'terminal'
		);
		if (!app) throw new Error('Terminal-App ist nicht geöffnet');
		return app.content;
	}
}
