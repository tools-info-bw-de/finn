type ExtinctListener = (timeoutUuid: string) => void;
type DeliveredListener = (timeoutUuid: string) => void;

export class SimulationEventBus {
	private static instance: SimulationEventBus;
	private listeners = new Map<string, ExtinctListener[]>();
	private deliveredListeners = new Map<string, DeliveredListener[]>();
	// Zählt lebende Kopien eines aufgesplitteten Pakets (z.B. ARP-Broadcasts im Switch)
	private branchCounts = new Map<string, number>();

	public static getInstance(): SimulationEventBus {
		if (!SimulationEventBus.instance) {
			SimulationEventBus.instance = new SimulationEventBus();
		}
		return SimulationEventBus.instance;
	}

	public clear(): void {
		this.listeners.clear();
		this.deliveredListeners.clear();
		this.branchCounts.clear();
	}

	public onExtinct(timeoutUuid: string, callback: ExtinctListener): void {
		const current = this.listeners.get(timeoutUuid) || [];
		this.listeners.set(timeoutUuid, [...current, callback]);
	}

	public offExtinct(timeoutUuid: string): void {
		this.listeners.delete(timeoutUuid);
	}

	/** Registriert einen Listener für die simulierte TCP-Segmentzustellung (nicht für ein TCP-ACK). */
	public onDelivered(timeoutUuid: string, callback: DeliveredListener): void {
		const current = this.deliveredListeners.get(timeoutUuid) || [];
		this.deliveredListeners.set(timeoutUuid, [...current, callback]);
	}

	/** Entfernt den Zustellungs-Listener dieses TCP-Segments. */
	public offDelivered(timeoutUuid: string): void {
		this.deliveredListeners.delete(timeoutUuid);
	}

	public emitExtinct(timeoutUuid: string): void {
		const callbacks = this.listeners.get(timeoutUuid);
		if (callbacks) {
			callbacks.forEach((cb) => cb(timeoutUuid));
			this.listeners.delete(timeoutUuid);
		}
	}

	/** Meldet TCP die Segmentzustellung und räumt Listener auf; das TCP-ACK bleibt separat erforderlich. */
	public emitDelivered(timeoutUuid: string): void {
		const callbacks = this.deliveredListeners.get(timeoutUuid);
		if (callbacks) {
			callbacks.forEach((cb) => cb(timeoutUuid));
		}
		this.deliveredListeners.delete(timeoutUuid);
		this.listeners.delete(timeoutUuid);
	}

	/**
	 * Registriert `count` zusätzliche lebende Kopien für `id` (z.B. beim Aufsplitten eines Broadcasts).
	 */
	public registerBranch(id: string, count: number): void {
		if (count === 0) return;
		const current = this.branchCounts.get(id) ?? 0;
		this.branchCounts.set(id, current + count);
	}

	/**
	 * Meldet, dass eine Kopie von `id` verworfen/verarbeitet wurde. Sind keine Kopien mehr übrig,
	 * wird `emitExtinct` ausgelöst (Pseudo-Timeout).
	 */
	public resolveBranch(id: string): void {
		const current = this.branchCounts.get(id);
		if (current === undefined) return;
		if (current <= 1) {
			this.branchCounts.delete(id);
			this.emitExtinct(id);
		} else {
			this.branchCounts.set(id, current - 1);
		}
	}

	/**
	 * Beendet das Branch-Tracking für `id` ohne `emitExtinct` auszulösen (z.B. bei Erfolg).
	 */
	public clearBranch(id: string): void {
		this.branchCounts.delete(id);
	}
}
