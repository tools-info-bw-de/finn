// Speichert den Zustand/Einstellungen der Hosts in den (geöffneten) Windows

export type app =
	| 'terminal'
	| 'webbrowser'
	| 'webserver'
	| 'dnsserver'
	| 'simpleclient'
	| 'echoserver'
	| 'file-explorer'
	| 'settings';

export const hosts = $state<
	{
		uuid: string;
		installedApps: app[];
		openApp: app;
	}[]
>([]);
