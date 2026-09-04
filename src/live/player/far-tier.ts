import type { LatencyTier } from "./latency-window.ts";

export const FAR_STALL_GRACE_MS = 20000;
export const FAR_ABR_ESTIMATE_BPS = 2_500_000;
export const DEFAULT_ABR_ESTIMATE_BPS = 10_000_000;
export const FAR_STARTUP_RUNWAY_S = 6;

export function stallGraceMsFor(tier: LatencyTier, baseMs: number): number {
    return tier === "far" ? Math.max(baseMs, FAR_STALL_GRACE_MS) : baseMs;
}

export function abrEstimateFor(tier: LatencyTier): number {
    return tier === "far" ? FAR_ABR_ESTIMATE_BPS : DEFAULT_ABR_ESTIMATE_BPS;
}

export function startupRunwayFor(tier: LatencyTier, baseS: number): number {
    return tier === "far" ? Math.max(baseS, FAR_STARTUP_RUNWAY_S) : baseS;
}
