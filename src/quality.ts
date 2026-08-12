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

export function parseLockedList(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const raw = (value as { locked?: unknown }).locked;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
    return out;
}

export function isQualityLockedFrame(value: unknown): boolean {
    return !!value && typeof value === "object" && (value as { error?: unknown }).error === "quality-locked";
}

export function highestAllowed(qualities: readonly string[], locked: readonly string[]): string | null {
    for (const name of qualities) {
        if (!locked.includes(name)) return name;
    }
    return null;
}

export function allowedSubset(qualities: readonly string[], locked: readonly string[]): string[] {
    return qualities.filter((name) => !locked.includes(name));
}

export function streamQualityText(width: number, height: number, fps: number): string {
    const side = width > 0 && height > 0 ? Math.min(width, height) : Math.max(width, height, 0);
    const res = side > 1440 ? "4K" : side > 1080 ? "1440p" : side > 0 ? `${side}p` : "";
    const rate = fps > 0 ? String(Math.round(fps)) : "";
    if (!res) return "high quality";
    return rate ? `${res}${rate}` : res;
}
