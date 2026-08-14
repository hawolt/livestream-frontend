export interface LatencyWindow {
    sync: number;
    max: number;
}

export function latencyWindowFor(targetduration: number): LatencyWindow | null {
    if (!Number.isFinite(targetduration) || targetduration <= 4) return null;
    const sync = Math.min(targetduration + 1, 12);
    const max = Math.min(Math.max(targetduration * 3, sync + 4), 30);
    return { sync, max };
}
