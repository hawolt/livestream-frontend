export interface LatencyWindow {
    sync: number;
    max: number;
}

export function latencyWindowFor(targetduration: number): LatencyWindow | null {
    if (!Number.isFinite(targetduration) || targetduration <= 4) return null;
    const sync = Math.min(targetduration + 3, 15);
    const max = Math.min(Math.max(targetduration * 3, sync + 4), 30);
    return { sync, max };
}

export type LatencyTier = "near" | "mid" | "far";

export const NEAR_RTT_MS = 60;
export const FAR_RTT_MS = 250;

export function latencyTierFor(rttMs: number | null, originLL: boolean): LatencyTier {
    if (rttMs === null || !Number.isFinite(rttMs) || rttMs < 0) return "mid";
    if (rttMs > FAR_RTT_MS) return "far";
    if (rttMs > NEAR_RTT_MS || !originLL) return "mid";
    return "near";
}

export function farWindowFor(targetduration: number): LatencyWindow | null {
    if (!Number.isFinite(targetduration) || targetduration <= 0) return null;
    const sync = Math.min(Math.max(targetduration * 2 + 2, 8), 15);
    const max = Math.min(Math.max(targetduration * 4 + 4, sync + 6), 30);
    return { sync, max };
}
