export interface AboutClip {
    id: string;
    title: string;
    createdAt: string;
    url: string;
    poster: string;
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
        });
    }
    return out;
}

export async function loadChannelClips(username: string): Promise<AboutClip[]> {
    if (!username) return [];
    try {
        const res = await fetch(`/api/live/clips/channel/${encodeURIComponent(username)}`);
        if (!res.ok) return [];
        const data: unknown = await res.json();
        return normalizeClipsPayload(data);
    } catch {
        return [];
    }
}
