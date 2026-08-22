export interface TwitchBadgeVersion {
    image_url_2x: string;
    title: string;
}

export type TwitchBadgeSets = Record<string, Record<string, TwitchBadgeVersion>>;

export function badgeSetsFromPayload(payload: unknown): TwitchBadgeSets {
    const sets: TwitchBadgeSets = {};
    const badgeSets = (payload as any)?.badge_sets;
    if (typeof badgeSets !== "object" || badgeSets === null) return sets;
    for (const [setId, setValue] of Object.entries(badgeSets as Record<string, unknown>)) {
        const versions = (setValue as any)?.versions;
        if (typeof versions !== "object" || versions === null) continue;
        const versionMap: Record<string, TwitchBadgeVersion> = {};
        for (const [versionId, versionValue] of Object.entries(versions as Record<string, unknown>)) {
            const v = versionValue as any;
            if (typeof v?.image_url_2x !== "string") continue;
            versionMap[versionId] = {
                image_url_2x: v.image_url_2x,
                title: typeof v.title === "string" && v.title ? v.title : setId,
            };
        }
        if (Object.keys(versionMap).length > 0) sets[setId] = versionMap;
    }
    return sets;
}

export function mergeBadgeSets(base: TwitchBadgeSets, override: TwitchBadgeSets): TwitchBadgeSets {
    const merged: TwitchBadgeSets = {};
    for (const [setId, versions] of Object.entries(base)) merged[setId] = { ...versions };
    for (const [setId, versions] of Object.entries(override)) {
        merged[setId] = { ...(merged[setId] ?? {}), ...versions };
    }
    return merged;
}

export interface ParsedBadgeTagEntry {
    name: string;
    version: string;
}

export function parseBadgeTagEntries(badgesTag: string): ParsedBadgeTagEntry[] {
    const out: ParsedBadgeTagEntry[] = [];
    if (!badgesTag) return out;
    for (const entry of badgesTag.split(",")) {
        if (!entry) continue;
        const slash = entry.indexOf("/");
        const name = slash < 0 ? entry : entry.slice(0, slash);
        const version = slash < 0 ? "1" : entry.slice(slash + 1);
        if (name) out.push({ name, version });
    }
    return out;
}

export interface ResolvedTwitchBadge {
    name: string;
    url: string;
    title: string;
}

export function resolveTwitchBadges(badgesTag: string, sets: TwitchBadgeSets): ResolvedTwitchBadge[] {
    const out: ResolvedTwitchBadge[] = [];
    for (const { name, version } of parseBadgeTagEntries(badgesTag)) {
        const v = sets[name]?.[version];
        if (v) out.push({ name, url: v.image_url_2x, title: v.title });
    }
    return out;
}
