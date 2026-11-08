type ExtinctListener = (timeoutUuid: string, message?: string) => void;
type DeliveredListener = (timeoutUuid: string) => void;
type NoticeListener = (message: string | undefined) => void;

interface OriginEntry {
	origin: object;
	parent?: { id: string; entry: OriginEntry };
}

export class SimulationEventBus {
	private static instance: SimulationEventBus;
	private listeners = new Map<string, ExtinctListener[]>();
	private deliveredListeners = new Map<string, DeliveredListener[]>();
	private origins = new Map<string, OriginEntry>();
	private cancellations = new Map<string, () => void>();
	private noticeListeners = new Set<NoticeListener>();
	// Zählt lebende Kopien eines aufgesplitteten Pakets (z.B. ARP-Broadcasts im Switch)
	private branchCounts = new Map<string, number>();

	public static getInstance(): SimulationEventBus {
		if (!SimulationEventBus.instance) {
			SimulationEventBus.instance = new SimulationEventBus();
		}
		return SimulationEventBus.instance;
	}

	public clear(): void {
		const cancellations = [...this.cancellations.values()];
		this.listeners.clear();
		this.deliveredListeners.clear();
		this.branchCounts.clear();
		this.origins.clear();
		this.cancellations.clear();
		this.noticeListeners.forEach((listener) => listener(undefined));
		cancellations.forEach((cancel) => cancel());
	}

	public registerOrigin(id: string, origin: object, cancel?: () => void, parentId?: string): void {
		const parent = parentId ? this.origins.get(parentId) : undefined;
		this.origins.set(id, {
			origin,
			parent: parent && parentId ? { id: parentId, entry: parent } : undefined
		});
		if (cancel) this.cancellations.set(id, cancel);
	}

	public forgetOrigin(id: string): void {
		this.origins.delete(id);
		this.cancellations.delete(id);
	}

	public hasOtherOrigin(id: string, location: object): boolean {
		const origin = this.origins.get(id)?.origin;
		return origin !== undefined && origin !== location;
	}

	public onNotice(listener: NoticeListener): () => void {
		this.noticeListeners.add(listener);
		return () => this.noticeListeners.delete(listener);
	}

	public reportDiagnostic(
		id: string,
		location: object,
		message: string,
		includeOrigin = false
	): void {
		let entry = this.origins.get(id);
		while (entry) {
			if (includeOrigin || entry.origin !== location) {
				this.noticeListeners.forEach((listener) => listener(message));
				return;
			}
			const parent = entry.parent;
			entry = parent && this.origins.get(parent.id) === parent.entry ? parent.entry : undefined;
		}
	}

	public reportFailure(id: string, location: object, message: string): void {
		const origin = this.origins.get(id)?.origin;
		this.reportDiagnostic(id, location, message);
		this.emitExtinct(id, origin === location ? message : undefined);
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

	public emitExtinct(timeoutUuid: string, message?: string): void {
		const callbacks = this.listeners.get(timeoutUuid);
		if (callbacks) {
			this.listeners.delete(timeoutUuid);
			callbacks.forEach((cb) => cb(timeoutUuid, message));
		}
	}

	/** Meldet TCP die Segmentzustellung und räumt Listener auf; das TCP-ACK bleibt separat erforderlich. */
	public emitDelivered(timeoutUuid: string): void {
		const callbacks = this.deliveredListeners.get(timeoutUuid);
		this.deliveredListeners.delete(timeoutUuid);
		this.listeners.delete(timeoutUuid);
		if (callbacks) {
			callbacks.forEach((cb) => cb(timeoutUuid));
		}
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
