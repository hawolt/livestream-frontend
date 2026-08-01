import { ctx } from "./context.ts";
import { applyDeferredGrid, updateStreamThumbnail, type StreamCard } from "./stream-cards.ts";

interface StreamPreview {
    card: StreamCard;
    layer: HTMLDivElement;
    frame: HTMLIFrameElement;
    status: HTMLSpanElement;
}

const PREVIEW_DELAY_MS = 300;
const PREVIEW_MESSAGE_TYPE = "itzon:stream-preview";

const hoverPreviewMedia = window.matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)");

let previewTimer: number | null = null;
let pendingPreview: StreamCard | null = null;
let activePreview: StreamPreview | null = null;

function clearPendingPreview(): void {
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }
    pendingPreview = null;
}

export function previewCardInFlight(): StreamCard | null {
    return activePreview?.card ?? pendingPreview;
}

export function stopStreamPreview(card?: StreamCard): void {
    const stopsPending = !card || pendingPreview === card;
    if (stopsPending) clearPendingPreview();
    const preview = activePreview;
    if (!preview || (card && preview.card !== card)) {
        if (stopsPending) applyDeferredGrid();
        return;
    }
    activePreview = null;
    preview.card.root.classList.remove("preview-connecting", "preview-playing");
    preview.layer.remove();
    const stream = ctx.streams.find((item) => item.username === preview.card.username);
    if (stream) updateStreamThumbnail(preview.card, stream);
    applyDeferredGrid();
}

function startStreamPreview(card: StreamCard): void {
    if (!card.root.isConnected || !hoverPreviewMedia.matches) return;
    const frame = document.createElement("iframe");
    frame.className = "explore-preview-frame";
    frame.src = `/embed/${encodeURIComponent(card.username.toLowerCase())}?preview=1`;
    frame.allow = "autoplay";
    frame.tabIndex = -1;
    frame.title = `${card.username} muted stream preview`;
    frame.setAttribute("aria-hidden", "true");

    const status = document.createElement("span");
    status.className = "explore-preview-status";
    status.textContent = "Connecting preview";
    status.setAttribute("aria-hidden", "true");

    const layer = document.createElement("div");
    layer.className = "explore-preview-layer";
    layer.append(frame, status);

    card.root.classList.add("preview-connecting");
    activePreview = { card, layer, frame, status };
    card.root.appendChild(layer);
}

export function queueStreamPreview(card: StreamCard): void {
    if (!hoverPreviewMedia.matches || pendingPreview === card || activePreview?.card === card) return;
    stopStreamPreview();
    pendingPreview = card;
    previewTimer = window.setTimeout(() => {
        previewTimer = null;
        if (pendingPreview !== card) return;
        pendingPreview = null;
        startStreamPreview(card);
    }, PREVIEW_DELAY_MS);
}

window.addEventListener("message", (e) => {
    const preview = activePreview;
    if (!preview || e.origin !== location.origin || e.source !== preview.frame.contentWindow) return;
    const data = e.data as { type?: unknown; state?: unknown };
    if (data?.type !== PREVIEW_MESSAGE_TYPE) return;
    if (data.state === "playing") {
        preview.card.root.classList.remove("preview-connecting");
        preview.card.root.classList.add("preview-playing");
        preview.status.textContent = "Muted preview";
        return;
    }
    preview.card.root.classList.remove("preview-playing");
    preview.card.root.classList.add("preview-connecting");
    preview.status.textContent = data.state === "unavailable" ? "Preview unavailable" : "Connecting preview";
});

window.addEventListener("pagehide", () => stopStreamPreview());

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopStreamPreview();
});

hoverPreviewMedia.addEventListener("change", () => {
    if (!hoverPreviewMedia.matches) stopStreamPreview();
});
