import { ACHIEVEMENT_GLYPHS, type AchievementKey } from "./achievement-catalog.ts";
import { tierRingColor } from "./achievements-decision.ts";

export function achievementMedallionSvg(key: AchievementKey, tier: number, size: number): string {
    const glyph = ACHIEVEMENT_GLYPHS[key];
    const ring = tierRingColor(tier);
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="${ring}" stroke-width="2.5"/><circle cx="20" cy="20" r="15.5" fill="#1a2029"/>${glyph}</svg>`;
}

const LOCKED_RING_COLOR = "#3f4854";
const LOCKED_GLYPH_OPACITY = 0.35;

export function lockedAchievementMedallionSvg(key: AchievementKey, size: number): string {
    const glyph = ACHIEVEMENT_GLYPHS[key];
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="${LOCKED_RING_COLOR}" stroke-width="2.5"/><circle cx="20" cy="20" r="15.5" fill="#1a2029"/><g opacity="${LOCKED_GLYPH_OPACITY}">${glyph}</g></svg>`;
}
