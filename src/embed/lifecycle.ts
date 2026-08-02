import { posterEl, stageEl, unmuteBtn, video } from "./dom.ts";
import { ctx, isCurrent, nextGen, previewMode } from "./context.ts";
import { PREVIEW_MESSAGE_TYPE, RETRY_MAX_MS, RETRY_MIN_MS, RETRY_MULT } from "./constants.ts";
import { stopChase } from "./chase.ts";
import { startHLSTransport, startWSTransport, stopHLSBeacon } from "./transport.ts";

function notifyPreview(state: "connecting" | "playing" | "unavailable"): void {
    if (!previewMode || window.parent === window) return;
    window.parent.postMessage({ type: PREVIEW_MESSAGE_TYPE, state }, location.origin);
}

let retryTimer: number | null = null;
let retryDelay = RETRY_MIN_MS;

export function clearRetryTimer(): void {
    if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
    }
}

export function resetRetryBackoff(): void {
    retryDelay = RETRY_MIN_MS;
}

export function nextRetryDelay(): number {
    const d = retryDelay;
    retryDelay = Math.min(retryDelay * RETRY_MULT, RETRY_MAX_MS);
    return d;
}

let lastMediaBaseRefresh = 0;

async function refreshMediaBase(): Promise<void> {
    const now = Date.now();
    if (now - lastMediaBaseRefresh < 30000) return;
    lastMediaBaseRefresh = now;
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`);
        if (!res.ok) return;
        const info = await res.json();
        if (info && typeof info.mediaBase === "string") {
            ctx.mediaBase = info.mediaBase.replace(/\/+$/, "");
        }
    } catch {}
}

export function scheduleRestart(delayMs: number, g: number): void {
    clearRetryTimer();
    retryTimer = window.setTimeout(async () => {
        retryTimer = null;
        if (!isCurrent(g)) return;
        await refreshMediaBase();
        if (!isCurrent(g)) return;
        beginTransport();
    }, delayMs);
}

export function setPoster(label: string | null): void {
    if (label === null) {
        posterEl.classList.add("hidden");
        posterEl.textContent = "";
        return;
    }
    posterEl.textContent = label;
    posterEl.classList.remove("hidden");
}

export function showUnmute(show: boolean): void {
    if (previewMode) {
        unmuteBtn.classList.add("hidden");
        return;
    }
    unmuteBtn.classList.toggle("hidden", !show);
}

export function fullTeardown(): void {
    ctx.hlsVideoCleanup?.();
    ctx.hlsVideoCleanup = null;
    stopChase();
    stopHLSBeacon();
    if (ctx.ws) {
        ctx.ws.onopen = null;
        ctx.ws.onmessage = null;
        ctx.ws.onclose = null;
        ctx.ws.onerror = null;
        try {
            ctx.ws.close();
        } catch {}
    }
    ctx.ws = null;
    if (ctx.sourceBuffer) {
        try {
            if (ctx.sourceBuffer.updating) ctx.sourceBuffer.abort();
        } catch {}
        if (ctx.mediaSource && ctx.mediaSource.readyState === "open") {
            try {
                ctx.mediaSource.removeSourceBuffer(ctx.sourceBuffer);
            } catch {}
        }
    }
    ctx.sourceBuffer = null;
    ctx.mediaSource = null;
    ctx.appendQueue = [];
    ctx.startedPlayback = false;
    if (ctx.objectUrl) {
        URL.revokeObjectURL(ctx.objectUrl);
        ctx.objectUrl = null;
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    showUnmute(false);
}

export function setPlaying(): void {
    ctx.offline = false;
    setPoster(null);
    showUnmute(video.muted || video.volume === 0);
    notifyPreview("playing");
}

export function goOffline(g: number): void {
    if (!ctx.offline) resetRetryBackoff();
    ctx.offline = true;
    fullTeardown();
    setPoster("Offline");
    notifyPreview("unavailable");
    scheduleRestart(nextRetryDelay(), g);
}

export function restartAfterFailure(g: number): void {
    if (!isCurrent(g)) return;
    fullTeardown();
    setPoster(null);
    notifyPreview("connecting");
    scheduleRestart(nextRetryDelay(), g);
}

export function beginTransport(): void {
    if (ctx.terminal || ctx.transportKind === "none") return;
    clearRetryTimer();
    const g = nextGen();
    fullTeardown();
    notifyPreview("connecting");
    if (ctx.transportKind === "ws") startWSTransport(g);
    else if (ctx.transportKind === "hls") startHLSTransport(g);
    else goOffline(g);
}

export function enterTerminal(label: string): void {
    if (ctx.terminal) return;
    ctx.terminal = true;
    clearRetryTimer();
    nextGen();
    fullTeardown();
    setPoster(label);
    notifyPreview("unavailable");
}

export function wireUnmute(): void {
    if (previewMode) {
        showUnmute(false);
        return;
    }
    unmuteBtn.addEventListener("click", () => {
        video.muted = false;
        if (video.volume === 0) video.volume = 1;
        void video.play().catch(() => {});
        showUnmute(false);
    });
    stageEl.addEventListener("click", (ev) => {
        if (ev.target === unmuteBtn || unmuteBtn.contains(ev.target as Node)) return;
        if (video.muted && !ctx.offline) {
            video.muted = false;
            if (video.volume === 0) video.volume = 1;
            void video.play().catch(() => {});
            showUnmute(false);
        }
    });
}

export function wirePageLifecycle(): void {
    window.addEventListener("pagehide", () => {
        if (ctx.terminal) return;
        clearRetryTimer();
        nextGen();
        fullTeardown();
    });
    window.addEventListener("pageshow", (ev) => {
        if (ctx.terminal) return;
        if ((ev as PageTransitionEvent).persisted) beginTransport();
    });
}
