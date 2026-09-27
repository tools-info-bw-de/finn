type ExtinctListener = (timeoutUuid: string) => void;

export class SimulationEventBus {
	private static instance: SimulationEventBus;
	private listeners = new Map<string, ExtinctListener[]>();

	public static getInstance(): SimulationEventBus {
		if (!SimulationEventBus.instance) {
			SimulationEventBus.instance = new SimulationEventBus();
		}
		return SimulationEventBus.instance;
	}

	public onExtinct(timeoutUuid: string, callback: ExtinctListener): void {
		const current = this.listeners.get(timeoutUuid) || [];
		this.listeners.set(timeoutUuid, [...current, callback]);
	}

	public offExtinct(timeoutUuid: string): void {
		this.listeners.delete(timeoutUuid);
	}

	public emitExtinct(timeoutUuid: string): void {
		const callbacks = this.listeners.get(timeoutUuid);
		if (callbacks) {
			callbacks.forEach((cb) => cb(timeoutUuid));
			this.listeners.delete(timeoutUuid);
		}
	}
}
