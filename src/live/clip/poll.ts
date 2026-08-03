import { CLIP_POLL_MS } from "../constants.ts";
import { clipCtx } from "./context.ts";

let pollTimer: number | null = null;
let pollLoading = false;

function pollVisible(): boolean {
    return document.visibilityState === "visible";
}

interface ClipStatusResponse {
    status?: string;
    url?: string;
    error?: string;
    phase?: string;
    queuePosition?: number;
}

async function fetchClipStatus(generation: number, onUpdate: () => void): Promise<void> {
    const id = clipCtx.clipId;
    if (!id) return;
    try {
        const res = await fetch(`/api/live/clips/${encodeURIComponent(id)}`);
        if (generation !== clipCtx.pollGeneration) return;
        if (!res.ok) return;
        const data = await res.json() as ClipStatusResponse;
        if (generation !== clipCtx.pollGeneration) return;
        if (data.status === "ready") {
            clipCtx.phase = "ready";
            clipCtx.resultUrl = typeof data.url === "string" ? data.url : null;
            stopClipStatusPolling();
            onUpdate();
        } else if (data.status === "failed") {
            clipCtx.phase = "failed";
            clipCtx.errorMessage = typeof data.error === "string" && data.error ? data.error : "Clip processing failed.";
            stopClipStatusPolling();
            onUpdate();
        } else {
            clipCtx.jobPhase = typeof data.phase === "string" ? data.phase : null;
            clipCtx.jobQueuePosition = typeof data.queuePosition === "number" ? data.queuePosition : null;
            onUpdate();
        }
    } catch {}
}

async function pollOnce(generation: number, onUpdate: () => void): Promise<void> {
    if (pollLoading || !pollVisible() || generation !== clipCtx.pollGeneration) return;
    pollLoading = true;
    try {
        await fetchClipStatus(generation, onUpdate);
    } finally {
        pollLoading = false;
    }
}

export function startClipStatusPolling(onUpdate: () => void): void {
    stopClipStatusPolling();
    const generation = clipCtx.pollGeneration;
    void pollOnce(generation, onUpdate);
    pollTimer = window.setInterval(() => void pollOnce(generation, onUpdate), CLIP_POLL_MS);
}

export function stopClipStatusPolling(): void {
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}
