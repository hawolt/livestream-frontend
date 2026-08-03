export interface ClipStatusRecord {
    id: string;
    channel: string;
    title: string;
    status: string;
    phase: string | null;
    queuePosition: number | null;
    durationMs: number | null;
    createdAt: string;
    url: string | null;
    thumbnailUrl: string | null;
    pageUrl: string | null;
    error: string | null;
}

function parseClipStatusRecord(data: Record<string, unknown>): ClipStatusRecord {
    return {
        id: typeof data.id === "string" ? data.id : "",
        channel: typeof data.channel === "string" ? data.channel : "",
        title: typeof data.title === "string" ? data.title : "",
        status: typeof data.status === "string" ? data.status : "processing",
        phase: typeof data.phase === "string" ? data.phase : null,
        queuePosition: typeof data.queuePosition === "number" ? data.queuePosition : null,
        durationMs: typeof data.durationMs === "number" ? data.durationMs : null,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        url: typeof data.url === "string" && data.url ? data.url : null,
        thumbnailUrl: typeof data.thumbnailUrl === "string" && data.thumbnailUrl ? data.thumbnailUrl : null,
        pageUrl: typeof data.pageUrl === "string" && data.pageUrl ? data.pageUrl : null,
        error: typeof data.error === "string" && data.error ? data.error : null,
    };
}

export async function fetchClipByCode(code: string): Promise<ClipStatusRecord | null | "not-found"> {
    try {
        const res = await fetch(`/api/live/clips/${encodeURIComponent(code)}`);
        if (res.status === 404) return "not-found";
        if (!res.ok) return null;
        const data = await res.json() as Record<string, unknown>;
        return parseClipStatusRecord(data);
    } catch {
        return null;
    }
}

const POLL_MS = 2000;

let pollTimer: number | null = null;
let pollLoading = false;
let pollGeneration = 0;

function pollVisible(): boolean {
    return document.visibilityState === "visible";
}

async function pollOnce(code: string, generation: number, onResult: (result: ClipStatusRecord | null | "not-found") => void): Promise<void> {
    if (pollLoading || !pollVisible() || generation !== pollGeneration) return;
    pollLoading = true;
    try {
        const result = await fetchClipByCode(code);
        if (generation === pollGeneration) onResult(result);
    } finally {
        pollLoading = false;
    }
}

export function startClipStatusPolling(code: string, onResult: (result: ClipStatusRecord | null | "not-found") => void): void {
    stopClipStatusPolling();
    pollGeneration += 1;
    const generation = pollGeneration;
    pollTimer = window.setInterval(() => void pollOnce(code, generation, onResult), POLL_MS);
}

export function clipStatusPollingActive(): boolean {
    return pollTimer !== null;
}

export function stopClipStatusPolling(): void {
    pollGeneration += 1;
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

window.addEventListener("pagehide", () => stopClipStatusPolling());
