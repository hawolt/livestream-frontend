import { clipBodyEl, clipChannelLinkEl, clipCreatedEl, clipStateEl, clipTitleEl, clipVideoEl } from "./dom.ts";
import type { ClipRecord } from "./api.ts";
import { clipProcessingMessage } from "../clip-processing-message.ts";

function formatClipDate(createdAt: string): string {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(createdAt)) return "";
    const d = new Date(createdAt);
    if (!Number.isFinite(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}.${d.getFullYear()}`;
}

export function showLoading(): void {
    clipStateEl.hidden = false;
    clipStateEl.textContent = "Loading clip...";
    clipBodyEl.hidden = true;
}

export function showNotFound(): void {
    clipStateEl.hidden = false;
    clipStateEl.textContent = "This clip does not exist.";
    clipBodyEl.hidden = true;
}

export function showLoadError(): void {
    clipStateEl.hidden = false;
    clipStateEl.textContent = "Could not load this clip. Try refreshing the page.";
    clipBodyEl.hidden = true;
}

export function renderClip(clip: ClipRecord): void {
    clipBodyEl.hidden = false;
    clipTitleEl.textContent = clip.title || "Untitled clip";
    clipChannelLinkEl.textContent = clip.channel;
    clipChannelLinkEl.href = clip.channel ? `/${encodeURIComponent(clip.channel)}` : "#";
    clipCreatedEl.textContent = formatClipDate(clip.createdAt);
    if (clip.status === "ready" && clip.url) {
        clipStateEl.hidden = true;
        clipVideoEl.hidden = false;
        if (clipVideoEl.getAttribute("src") !== clip.url) clipVideoEl.src = clip.url;
        return;
    }
    clipVideoEl.hidden = true;
    clipStateEl.hidden = false;
    if (clip.status === "failed") {
        clipStateEl.textContent = clip.error ? `This clip failed to process: ${clip.error}` : "This clip failed to process.";
    } else {
        clipStateEl.textContent = clipProcessingMessage(clip.phase, clip.queuePosition,
            "This clip is still processing. This page will update automatically.");
    }
}
