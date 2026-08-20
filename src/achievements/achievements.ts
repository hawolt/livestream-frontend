import { ACHIEVEMENT_NAMES, KNOWN_ACHIEVEMENT_KEYS, type AchievementKey } from "./achievement-catalog.ts";
import { toRomanNumeral } from "./achievements-decision.ts";

export interface Achievement {
    key: AchievementKey;
    tier: number;
    unlockedAt: string;
}

function stringField(item: Record<string, unknown>, key: string): string {
    return typeof item[key] === "string" ? (item[key] as string) : "";
}

export function normalizeAchievements(raw: unknown): Achievement[] {
    if (!Array.isArray(raw)) return [];
    const out: Achievement[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const key = stringField(item, "key");
        if (!KNOWN_ACHIEVEMENT_KEYS.has(key)) continue;
        const tier = item["tier"];
        if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 1) continue;
        const unlockedAt = stringField(item, "unlockedAt");
        if (!unlockedAt) continue;
        out.push({ key: key as AchievementKey, tier, unlockedAt });
    }
    return out.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
}

export function achievementDisplayName(key: AchievementKey): string {
    return ACHIEVEMENT_NAMES[key];
}

export function achievementTooltip(key: AchievementKey, tier: number): string {
    const name = achievementDisplayName(key);
    return tier >= 2 ? `${name} ${toRomanNumeral(tier)}` : name;
}
