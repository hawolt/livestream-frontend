import { fetchClip, type ClipRecord } from "./api.ts";

const POLL_MS = 2000;

let pollTimer: number | null = null;
let pollLoading = false;
let pollGeneration = 0;

function pollVisible(): boolean {
    return document.visibilityState === "visible";
}

async function pollOnce(id: string, generation: number, onResult: (result: ClipRecord | null | "not-found") => void): Promise<void> {
    if (pollLoading || !pollVisible() || generation !== pollGeneration) return;
    pollLoading = true;
    try {
        const result = await fetchClip(id);
        if (generation === pollGeneration) onResult(result);
    } finally {
        pollLoading = false;
    }
}

export function startClipPolling(id: string, onResult: (result: ClipRecord | null | "not-found") => void): void {
    stopClipPolling();
    pollGeneration += 1;
    const generation = pollGeneration;
    pollTimer = window.setInterval(() => void pollOnce(id, generation, onResult), POLL_MS);
}

export function clipPollingActive(): boolean {
    return pollTimer !== null;
}

export function stopClipPolling(): void {
    pollGeneration += 1;
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

window.addEventListener("pagehide", () => stopClipPolling());
