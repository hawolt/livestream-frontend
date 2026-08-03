import { parseClipIdFromPath } from "./id.ts";
import { fetchClip, type ClipRecord } from "./api.ts";
import { renderClip, showLoadError, showLoading, showNotFound } from "./render.ts";
import { startClipPolling, stopClipPolling } from "./poll.ts";

function applyResult(id: string, result: ClipRecord | null | "not-found"): void {
    if (result === "not-found") {
        stopClipPolling();
        showNotFound();
        return;
    }
    if (result === null) {
        showLoadError();
        return;
    }
    document.title = result.title ? `${result.title} - Clip` : "Clip";
    renderClip(result);
    if (result.status === "processing") {
        startClipPolling(id, (next) => applyResult(id, next));
    } else {
        stopClipPolling();
    }
}

export async function boot(): Promise<void> {
    const id = parseClipIdFromPath(location.pathname);
    if (!id) {
        showNotFound();
        return;
    }
    showLoading();
    const result = await fetchClip(id);
    applyResult(id, result);
}
