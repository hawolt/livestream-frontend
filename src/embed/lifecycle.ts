import { posterEl, stageEl, unmuteBtn, video } from "./dom.ts";
import { cleanfeedMode, controlsMode, ctx, isCurrent, nextGen, previewMode, runGenCleanup } from "./context.ts";
import { PREVIEW_MESSAGE_TYPE, RETRY_MAX_MS, RETRY_MIN_MS, RETRY_MULT } from "./constants.ts";
import { destroyHls, startHLSTransport, stopHLSBeacon } from "./transport.ts";
import { healthCheck, startHealthTimer, stopHealthTimer } from "./health.ts";
import { hasAudioInteraction, isUserPaused, overlayContains, setOverlayOffline } from "./overlay.ts";
import { resetSignedViewerId } from "../player-shared/viewer-id.ts";

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
        if (info) ctx.edgeServed = info.edge === true;
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
    if (previewMode || cleanfeedMode || controlsMode || hasAudioInteraction()) {
        unmuteBtn.classList.add("hidden");
        return;
    }
    unmuteBtn.classList.toggle("hidden", !show);
}

export function fullTeardown(): void {
    runGenCleanup();
    stopHLSBeacon();
    destroyHls();
    video.pause();
    video.removeAttribute("src");
    video.load();
    showUnmute(false);
}

export function setPlaying(): void {
    ctx.offline = false;
    ctx.state = "playing";
    ctx.lastStateChangeAt = Date.now();
    ctx.lastProgressAt = Date.now();
    ctx.lastObservedTime = video.currentTime;
    setPoster(null);
    setOverlayOffline(false);
    showUnmute(video.muted || video.volume === 0);
    notifyPreview("playing");
}

export function goOffline(g: number): void {
    if (!isCurrent(g)) return;
    if (!ctx.offline) resetRetryBackoff();
    resetSignedViewerId();
    ctx.offline = true;
    const retryGeneration = nextGen();
    fullTeardown();
    ctx.state = "offline";
    ctx.lastStateChangeAt = Date.now();
    setPoster("Offline");
    setOverlayOffline(true);
    notifyPreview("unavailable");
    scheduleRestart(nextRetryDelay(), retryGeneration);
}

export function restartAfterFailure(g: number, immediate = false): void {
    if (!isCurrent(g)) return;
    resetSignedViewerId();
    const retryGeneration = nextGen();
    fullTeardown();
    ctx.state = "retrying";
    ctx.lastStateChangeAt = Date.now();
    setPoster(null);
    notifyPreview("connecting");
    scheduleRestart(immediate ? 100 : nextRetryDelay(), retryGeneration);
}

export function beginTransport(): void {
    if (ctx.terminal || ctx.transportKind === "none") return;
    startHealthTimer();
    clearRetryTimer();
    const g = nextGen();
    fullTeardown();
    const now = Date.now();
    ctx.state = "connecting";
    ctx.lastStateChangeAt = now;
    ctx.lastProgressAt = now;
    ctx.lastObservedTime = video.currentTime;
    notifyPreview("connecting");
    if (ctx.transportKind === "hls-native" || ctx.transportKind === "hls-js") startHLSTransport(g);
    else goOffline(g);
}

export function enterTerminal(label: string): void {
    if (ctx.terminal) return;
    ctx.terminal = true;
    clearRetryTimer();
    stopHealthTimer();
    nextGen();
    fullTeardown();
    setPoster(label);
    setOverlayOffline(true);
    notifyPreview("unavailable");
}

export function wireUnmute(): void {
    if (previewMode || controlsMode) {
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
        if (overlayContains(ev.target as Node)) return;
        if (isUserPaused()) return;
        if (video.muted && !ctx.offline) {
            video.muted = false;
            if (video.volume === 0) video.volume = 1;
            void video.play().catch(() => {});
            showUnmute(false);
        }
    });
}

let pageHideTornDown = false;

export function wirePageLifecycle(): void {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") healthCheck();
    });
    window.addEventListener("online", healthCheck);
    window.addEventListener("pagehide", () => {
        if (ctx.terminal) return;
        pageHideTornDown = true;
        clearRetryTimer();
        stopHealthTimer();
        nextGen();
        fullTeardown();
    });
    window.addEventListener("pageshow", (ev) => {
        if (ctx.terminal) return;
        const persisted = (ev as PageTransitionEvent).persisted;
        if (persisted || pageHideTornDown) {
            pageHideTornDown = false;
            beginTransport();
        } else {
            healthCheck();
        }
    });
}
