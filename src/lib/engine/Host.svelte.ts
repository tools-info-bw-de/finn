import { DataLinkLayer } from './DataLinkLayer.svelte';
import { NetworkLayer } from './NetworkLayer';
import { ArpService } from './services/ArpService.svelte';
import type {
	App,
	AppName,
	AppType,
	DNSState,
	EchoServerState,
	NetworkNode,
	TerminalState,
	WebServerState,
	WebBrowserState
} from './types';
import { NetworkConfig } from './NetworkConfig.svelte';
import { ICMPService } from './services/ICMPService.svelte';
import { DNSService } from './services/DNSService.svelte';
import { UDPService } from './services/UDPService';
import { TCPService } from './services/TCPService';
import { EchoServerService } from './services/EchoServerService.svelte';
import { WebServerService } from './services/WebServerService.svelte';
import { WebBrowserService } from './services/WebBrowserService.svelte';
import { FileSystem } from './FileSystem.svelte';
import { defaultFiles } from './defaultWebsite';
import { SimpleClientService } from './services/SimpleClientService.svelte';
import { nodeSpawn } from '$lib/states/nodes.svelte';

// Ist entweder ein Notebook oder ein Rechner - wird nur durch den "type" unterschieden!
export class Host implements NetworkNode {
	public uuid: string = crypto.randomUUID();
	public name = $state<string>('');
	public config: NetworkConfig;
	public type: 'notebook' | 'desktop';
	public x = $state<number>(0);
	public y = $state<number>(0);

	public apps = $state<App[]>([]);
	public currentApp = $state<AppName>('');

	public dataLinkLayer: DataLinkLayer;
	public arpService: ArpService;
	public networkLayer: NetworkLayer;

	public icmp: ICMPService;
	public udp: UDPService;
	public tcp: TCPService;
	public dns: DNSService;
	public echoServer: EchoServerService;
	public webServer: WebServerService;
	public webBrowser: WebBrowserService;
	public fileSystem = new FileSystem(defaultFiles());

	constructor(
		name: string,
		macAddress: string,
		ipAddress: string,
		netmask: string,
		type: 'notebook' | 'desktop',
		gateway?: string,
		dns?: string,
		dataLinkLayerUuid?: string
	) {
		this.config = new NetworkConfig(macAddress, ipAddress, netmask);
		if (gateway) this.config.gateway = gateway;
		if (dns) this.config.dns = dns;

		this.name = name;
		this.type = type;
		this.x = nodeSpawn.x;
		this.y = nodeSpawn.y;

		this.dataLinkLayer = new DataLinkLayer(this.config);
		if (dataLinkLayerUuid) this.dataLinkLayer.uuid = dataLinkLayerUuid;

		this.arpService = new ArpService(this.config, this.dataLinkLayer);
		this.networkLayer = new NetworkLayer(this.config, this.arpService);

		this.icmp = new ICMPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('ICMP', this.icmp);
		this.udp = new UDPService(this.networkLayer);
		this.networkLayer.registerProtocolHandler('UDP', this.udp);
		this.tcp = new TCPService(this.networkLayer);
		this.echoServer = new EchoServerService(this.tcp);
		this.webServer = new WebServerService(this.tcp, this.fileSystem);
		this.networkLayer.registerProtocolHandler('TCP', this.tcp);
		this.icmp.registerErrorHandler('TCP', (packet, srcIp) =>
			this.tcp.handleIcmpError(packet, srcIp)
		);

		this.dns = new DNSService(
			this.udp,
			this.config,
			() => {
				const dnsApp = this.apps.find((app) => app.type === 'dns');
				return dnsApp?.content;
			},
			this.icmp
		);
		this.webBrowser = new WebBrowserService(this.tcp, this.dns);

		this.dataLinkLayer.upperLayer = this.networkLayer;
		this.networkLayer.lowerLayer = this.dataLinkLayer;
	}

	public createApp(type: AppType): App {
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
		} else if (type === 'dns') {
			return {
				type,
				content: {
					serverRunning: false,
					recursiveResolution: false,
					records: []
				}
			};
		} else if (type === 'echo-server') {
			return {
				type,
				content: this.echoServer
			};
		} else if (type === 'simple-client') {
			return {
				type,
				content: new SimpleClientService(this.tcp, this.dns)
			};
		} else if (type === 'web-server') {
			return {
				type,
				content: this.webServer
			};
		} else if (type === 'web-browser') {
			return {
				type,
				content: this.webBrowser
			};
		}
		return { type, content: null };
	}

	/** Stellt eine gespeicherte App wieder her (Gegenstück zum automatischen toJSON der Dienste). */
	public restoreApp(type: AppType, saved: unknown): App {
		const app = this.createApp(type);
		if (!saved || typeof saved !== 'object') return app;
		if (app.type === 'terminal' || app.type === 'dns') {
			// Reine Zustandsobjekte werden direkt übernommen
			return { ...app, content: saved } as App;
		}
		// Dienste stellen sich selbst wieder her
		(app.content as { restore?: (data: object) => void } | null)?.restore?.(saved);
		return app;
	}

	public openApp(type: AppType): void {
		if (!this.apps.some((app) => app.type === type)) {
			this.apps.push(this.createApp(type));
		}
		this.currentApp = type;
	}

	// Beendet die aktuelle App samt ihrem Zustand (Server werden gestoppt)
	public closeCurrentApp(): void {
		if (this.currentApp === 'simple-client') this.simpleClientState().dispose();
		if (this.currentApp === 'echo-server') this.echoServer.shutdown();
		if (this.currentApp === 'web-server') this.webServer.shutdown();
		if (this.currentApp === 'web-browser') this.webBrowser.reset();
		this.apps = this.apps.filter((app) => app.type !== this.currentApp);
		this.currentApp = '';
	}

	public dispose(): void {
		this.echoServer.dispose();
		this.webServer.dispose();
		this.webBrowser.dispose();
		for (const app of this.apps) {
			if (app.type === 'simple-client' && app.content) app.content.dispose();
		}
		this.tcp.dispose();
	}

	public terminalState(): TerminalState {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'terminal' }> => a.type === 'terminal'
		);
		if (!app) throw new Error('Terminal-App ist nicht geöffnet');
		return app.content;
	}

	public dnsState(): DNSState {
		const app = this.apps.find((a): a is Extract<App, { type: 'dns' }> => a.type === 'dns');
		if (!app) throw new Error('DNS-App ist nicht geöffnet');
		return app.content;
	}

	public echoServerState(): EchoServerState {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'echo-server' }> => a.type === 'echo-server'
		);
		if (!app) throw new Error('Echo-Server-App ist nicht geöffnet');
		return app.content;
	}

	public webServerState(): WebServerState {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'web-server' }> => a.type === 'web-server'
		);
		if (!app) throw new Error('Webserver-App ist nicht geöffnet');
		return app.content;
	}

	public webBrowserState(): WebBrowserState {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'web-browser' }> => a.type === 'web-browser'
		);
		if (!app) throw new Error('Webbrowser-App ist nicht geöffnet');
		return app.content;
	}

	public simpleClientState(): SimpleClientService {
		const app = this.apps.find(
			(a): a is Extract<App, { type: 'simple-client' }> => a.type === 'simple-client'
		);
		if (!app) throw new Error('Simple-Client-App ist nicht geöffnet');
		return app.content;
	}
}
