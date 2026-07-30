export const QUALITY_AUTO = "auto";
export const QUALITY_SOURCE = "source";

export function parseQualitiesFrame(value: unknown): string[] | null {
    if (!value || typeof value !== "object") return null;
    const raw = (value as { qualities?: unknown }).qualities;
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") return null;
        const name = item.trim();
        if (!name) return null;
        out.push(name);
    }
    return out;
}

export function isQualityOnlyFrame(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const obj = value as { codecs?: unknown; qualities?: unknown };
    return typeof obj.codecs !== "string" && Array.isArray(obj.qualities);
}

export function qualityLabel(name: string): string {
    if (name === QUALITY_AUTO) return "Auto";
    if (name === QUALITY_SOURCE) return "Source";
    return name;
}

export function ladderIndex(ladder: readonly string[], name: string): number {
    return ladder.indexOf(name);
}

export function downgradeTarget(ladder: readonly string[], current: string): string | null {
    const idx = ladderIndex(ladder, current);
    if (idx < 0 || idx >= ladder.length - 1) return null;
    return ladder[idx + 1] ?? null;
}

export function upgradeTarget(ladder: readonly string[], current: string): string | null {
    const idx = ladderIndex(ladder, current);
    if (idx <= 0) return null;
    return ladder[idx - 1] ?? null;
}

export function resolveNextQuality(
    preference: string,
    ladder: readonly string[],
    ladderKnown: boolean,
    sticky: string,
): string {
    if (!ladderKnown) return QUALITY_SOURCE;
    if (preference !== QUALITY_AUTO) {
        return ladder.includes(preference) ? preference : QUALITY_SOURCE;
    }
    if (!ladder.length) return QUALITY_SOURCE;
    if (ladder.includes(sticky)) return sticky;
    return ladder[0] ?? QUALITY_SOURCE;
}

export function qualityWsParam(name: string): string {
    return name && name !== QUALITY_SOURCE ? `&q=${encodeURIComponent(name)}` : "";
}

export interface AbrState {
    unhealthyStreak: number;
    healthyStreak: number;
    msSinceSwitch: number;
}

export function emptyAbrState(): AbrState {
    return { unhealthyStreak: 0, healthyStreak: 0, msSinceSwitch: 0 };
}

export type AbrSignal = "healthy" | "unhealthy" | "neutral";

export interface AbrSample {
    stallsInWindow: number;
    stallThreshold: number;
    bufferAheadS: number;
    minBufferS: number;
    comfortableBufferS: number;
    edgeLagS: number | null;
    laggingThresholdS: number;
    droppedFrameRatio: number | null;
    droppedRatioThreshold: number;
    paused: boolean;
}

export function classifyAbrSignal(sample: AbrSample): AbrSignal {
    if (sample.paused) return "neutral";
    const unhealthy =
        sample.stallsInWindow >= sample.stallThreshold ||
        sample.bufferAheadS < sample.minBufferS ||
        (sample.edgeLagS !== null && sample.edgeLagS > sample.laggingThresholdS) ||
        (sample.droppedFrameRatio !== null && sample.droppedFrameRatio >= sample.droppedRatioThreshold);
    if (unhealthy) return "unhealthy";
    const healthy =
        sample.stallsInWindow === 0 &&
        sample.bufferAheadS >= sample.comfortableBufferS &&
        (sample.edgeLagS === null || sample.edgeLagS <= sample.laggingThresholdS / 2) &&
        (sample.droppedFrameRatio === null || sample.droppedFrameRatio < sample.droppedRatioThreshold / 2);
    return healthy ? "healthy" : "neutral";
}

export function stepAbrState(state: AbrState, signal: AbrSignal, elapsedMs: number): AbrState {
    const msSinceSwitch = state.msSinceSwitch + elapsedMs;
    if (signal === "unhealthy") return { unhealthyStreak: state.unhealthyStreak + 1, healthyStreak: 0, msSinceSwitch };
    if (signal === "healthy") return { unhealthyStreak: 0, healthyStreak: state.healthyStreak + 1, msSinceSwitch };
    return { unhealthyStreak: state.unhealthyStreak, healthyStreak: state.healthyStreak, msSinceSwitch };
}

export type AbrAction = "downgrade" | "upgrade" | "hold";

export interface AbrThresholds {
    cooldownMs: number;
    downgradeStreak: number;
    upgradeStreak: number;
}

export function decideAbrAction(
    state: AbrState,
    ladderLength: number,
    currentIndex: number,
    thresholds: AbrThresholds,
): AbrAction {
    if (ladderLength < 2 || currentIndex < 0) return "hold";
    if (state.msSinceSwitch < thresholds.cooldownMs) return "hold";
    if (state.unhealthyStreak >= thresholds.downgradeStreak && currentIndex < ladderLength - 1) return "downgrade";
    if (state.healthyStreak >= thresholds.upgradeStreak && currentIndex > 0) return "upgrade";
    return "hold";
}
