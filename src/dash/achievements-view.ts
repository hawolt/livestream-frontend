import type { AchievementKey } from "../achievements/achievement-catalog.ts";

export interface AchievementEntry {
    key: AchievementKey;
    tier: number;
    current: number;
    next: number | null;
}

export function clampFillRatio(current: number, next: number | null): number {
    if (next === null || next <= 0) return 1;
    return Math.max(0, Math.min(1, current / next));
}

const compactFormatter = new Intl.NumberFormat("en-US");

export function formatMetric(n: number): string {
    return compactFormatter.format(Math.max(0, Math.round(n)));
}

export function progressLabel(current: number, next: number | null): string {
    if (next === null) return "Max";
    return `${formatMetric(current)} / ${formatMetric(next)}`;
}

export type AchievementDisplay =
    | { kind: "bar"; ratio: number; label: string }
    | { kind: "pending" }
    | { kind: "maxed" }
    | { kind: "done" };

export function achievementDisplay(entry: AchievementEntry): AchievementDisplay {
    if (entry.tier >= 1) {
        if (entry.next === null) return entry.tier === 1 ? { kind: "done" } : { kind: "maxed" };
        return { kind: "bar", ratio: clampFillRatio(entry.current, entry.next), label: progressLabel(entry.current, entry.next) };
    }
    if (entry.next !== null && entry.next <= 1) return { kind: "pending" };
    return { kind: "bar", ratio: clampFillRatio(entry.current, entry.next), label: progressLabel(entry.current, entry.next) };
}

export type AchievementBucket = "unlocked" | "in-progress" | "untouched";

export function achievementBucket(entry: AchievementEntry): AchievementBucket {
    if (entry.tier >= 1) return "unlocked";
    if (entry.current > 0) return "in-progress";
    return "untouched";
}

const BUCKET_ORDER: Record<AchievementBucket, number> = {
    unlocked: 0,
    "in-progress": 1,
    untouched: 2,
};

export function compareAchievementEntries(a: AchievementEntry, b: AchievementEntry): number {
    const bucketA = achievementBucket(a);
    const bucketB = achievementBucket(b);
    if (bucketA !== bucketB) return BUCKET_ORDER[bucketA] - BUCKET_ORDER[bucketB];
    if (bucketA === "unlocked") return b.tier - a.tier;
    if (bucketA === "in-progress") return clampFillRatio(b.current, b.next) - clampFillRatio(a.current, a.next);
    return 0;
}

export function sortAchievementEntries(entries: AchievementEntry[]): AchievementEntry[] {
    return [...entries].sort(compareAchievementEntries);
}
