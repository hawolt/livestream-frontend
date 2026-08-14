export type ClipsSort = "newest" | "views";

export interface AboutClip {
    id: string;
    title: string;
    createdAt: string;
    url: string;
    poster: string;
    views: number;
}

function stringField(item: Record<string, unknown>, key: string): string {
    return typeof item[key] === "string" ? (item[key] as string) : "";
}

export function normalizeClipsPayload(raw: unknown): AboutClip[] {
    if (!raw || typeof raw !== "object") return [];
    const list = (raw as { clips?: unknown }).clips;
    if (!Array.isArray(list)) return [];
    const out: AboutClip[] = [];
    for (const entry of list) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const id = stringField(item, "id");
        if (!id) continue;
        out.push({
            id,
            title: stringField(item, "title"),
            createdAt: stringField(item, "createdAt"),
            url: stringField(item, "url"),
            poster: stringField(item, "poster"),
            views: typeof item["views"] === "number" ? item["views"] as number : 0,
        });
    }
    return out;
}

export async function loadChannelClips(username: string, sort: ClipsSort = "newest"): Promise<AboutClip[]> {
    if (!username) return [];
    try {
        const query = sort === "views" ? "?sort=views" : "";
        const res = await fetch(`/api/live/clips/channel/${encodeURIComponent(username)}${query}`);
        if (!res.ok) return [];
        const data: unknown = await res.json();
        return normalizeClipsPayload(data);
    } catch {
        return [];
    }
}
