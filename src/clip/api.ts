export type ClipStatus = "processing" | "ready" | "failed";

export interface ClipRecord {
    id: string;
    status: ClipStatus;
    title: string;
    channel: string;
    createdAt: string;
    url: string | null;
    error: string | null;
    phase: string | null;
    queuePosition: number | null;
}

function parseStatus(value: unknown): ClipStatus {
    return value === "ready" || value === "failed" ? value : "processing";
}

export function parseClipRecord(id: string, data: Record<string, unknown>): ClipRecord {
    return {
        id,
        status: parseStatus(data.status),
        title: typeof data.title === "string" ? data.title : "",
        channel: typeof data.channel === "string" ? data.channel : "",
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        url: typeof data.url === "string" && data.url ? data.url : null,
        error: typeof data.error === "string" && data.error ? data.error : null,
        phase: typeof data.phase === "string" ? data.phase : null,
        queuePosition: typeof data.queuePosition === "number" ? data.queuePosition : null,
    };
}

export async function fetchClip(id: string): Promise<ClipRecord | null | "not-found"> {
    try {
        const res = await fetch(`/api/live/clips/${encodeURIComponent(id)}`);
        if (res.status === 404) return "not-found";
        if (!res.ok) return null;
        const data = await res.json() as Record<string, unknown>;
        return parseClipRecord(id, data);
    } catch {
        return null;
    }
}
