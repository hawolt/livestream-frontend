export const POINTS_BATCH_WINDOW_MS = 300000;

export class PointsBatcher {
    private sum = 0;
    private timer: number | null = null;

    constructor(
        private readonly flush: (sum: number) => void,
        private readonly windowMs: number = POINTS_BATCH_WINDOW_MS,
        private readonly schedule: (fn: () => void, ms: number) => number = (fn, ms) => window.setTimeout(fn, ms),
        private readonly cancel: (id: number) => void = (id) => window.clearTimeout(id),
    ) {}

    add(gained: number): void {
        if (!Number.isFinite(gained) || gained <= 0) return;
        if (this.sum === 0) {
            this.timer = this.schedule(() => this.fire(), this.windowMs);
        }
        this.sum += gained;
    }

    fire(): void {
        this.timer = null;
        if (this.sum <= 0) return;
        const sum = this.sum;
        this.sum = 0;
        this.flush(sum);
    }

    pending(): number {
        return this.sum;
    }

    dispose(): void {
        if (this.timer !== null) this.cancel(this.timer);
        this.timer = null;
        this.sum = 0;
    }
}
