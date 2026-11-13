type Point = { x: number; y: number };
type View = { x: number; y: number; zoom: number };

export class CanvasTouch {
	private pointers = new Map<number, Point>();
	private previous: { center: Point; distance: number } | null = null;
	pinched = false;

	has(pointerId: number) {
		return this.pointers.has(pointerId);
	}

	get size() {
		return this.pointers.size;
	}

	start(pointerId: number, point: Point) {
		this.pointers.set(pointerId, point);
		if (this.size === 2) this.pinched = true;
		if (this.size <= 2) this.rebase();
	}

	move(pointerId: number, point: Point, view: View, minZoom: number, maxZoom: number) {
		if (!this.has(pointerId)) return null;
		this.pointers.set(pointerId, point);
		if (!this.pinched) return null;
		const current = this.measure();
		if (!current || !this.previous) {
			this.previous = current;
			return null;
		}
		const ratio =
			this.previous.distance > 0 && current.distance > 0
				? current.distance / this.previous.distance
				: 1;
		const nextZoom = Math.min(Math.max(view.zoom * ratio, minZoom), maxZoom);
		const scale = nextZoom / view.zoom;
		const result = {
			x: current.center.x - (this.previous.center.x - view.x) * scale,
			y: current.center.y - (this.previous.center.y - view.y) * scale,
			zoom: nextZoom
		};
		this.previous = current;
		return result;
	}

	end(pointerId: number) {
		if (!this.pointers.delete(pointerId)) return;
		if (this.size === 0) {
			this.pinched = false;
			this.previous = null;
		} else {
			this.rebase();
		}
	}

	private rebase() {
		this.previous = this.measure();
	}

	private measure() {
		const [first, second] = this.pointers.values();
		if (!first) return null;
		if (!second) return { center: first, distance: 0 };
		return {
			center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
			distance: Math.hypot(second.x - first.x, second.y - first.y)
		};
	}
}
