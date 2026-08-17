import { badgeEl, behindReadoutEl, btnClip, btnLiveChip, posterEl, seekBarEl, stageEl, video } from "../dom.ts";
import { ctx, isCurrent, nextGen, runGenCleanup, type PlayerState } from "./context.ts";
import { PRUNE_KEEP_S, RETRY_MAX_MS, RETRY_MIN_MS, RETRY_MULT } from "../constants.ts";
import { QUALITY_SOURCE } from "../../quality.ts";
import { stopChase } from "./chase.ts";
import { hidePlayerControls } from "./controls-decision.ts";
import { destroyHls, stopHlsLoad, stopHLSBeacon, startHLSTransport } from "./hls.ts";
import { clearWaitingTimer, healthCheck, startHealthTimer, stopHealthTimer } from "./health.ts";
import { resetStreamInfo, setViewers } from "../stream-info.ts";
import { renderQualityMenu } from "../quality-menu.ts";
import { adoptWSTransport, startWSTransport } from "./ws.ts";
import { resetSeekDrag } from "../seekbar.ts";

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

export async function refreshMediaBase(): Promise<void> {
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
        if (info) ctx.wssBase = typeof info.wssBase === "string" ? info.wssBase.replace(/\/+$/, "") : "";
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

export function setBadge(on: boolean): void {
    badgeEl.hidden = on;
}

let offlineArtUrl: string | null = null;
let offlineArtWanted = false;

export function setOfflineArt(url: string | null): void {
    offlineArtUrl = url;
    applyOfflineArt(offlineArtWanted);
}

function applyOfflineArt(on: boolean): void {
    if (on && offlineArtUrl) {
        const safe = offlineArtUrl.replace(/"/g, "%22");
        posterEl.style.backgroundImage =
            `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url("${safe}")`;
        posterEl.classList.add("has-art");
        return;
    }
    posterEl.style.removeProperty("background-image");
    posterEl.classList.remove("has-art");
}

export function setPoster(label: string | null, isError = false, isLoading = false, withArt = false): void {
    if (label === null) {
        posterEl.classList.add("hidden");
        posterEl.classList.remove("loading");
        posterEl.textContent = "";
        posterEl.setAttribute("aria-busy", "false");
        stageEl.classList.remove("terminal");
        offlineArtWanted = false;
        applyOfflineArt(false);
        return;
    }
    posterEl.textContent = label;
    posterEl.classList.toggle("error", isError);
    posterEl.classList.toggle("loading", isLoading);
    posterEl.setAttribute("aria-busy", String(isLoading));
    posterEl.classList.remove("hidden");
    offlineArtWanted = withArt;
    applyOfflineArt(withArt);
}

export function setTerminal(label: string, isError = true): void {
    setPoster(label, isError);
    stageEl.classList.add("terminal");
}

export function enterTerminal(label: string): void {
    if (ctx.terminal) return;
    ctx.terminal = true;
    clearRetryTimer();
    stopHealthTimer();
    nextGen();
    fullTeardown();
    setTerminal(label, true);
}

export function setState(next: PlayerState): void {
    if (ctx.state === next) return;
    ctx.state = next;
    ctx.lastStateChangeAt = Date.now();
    renderPlayerUI();
}

export function renderPlayerUI(): void {
    if (ctx.terminal) return;
    stageEl.classList.toggle("player-offline",
        hidePlayerControls(ctx.state, document.body.classList.contains("clip-mode")));
    switch (ctx.state) {
        case "offline":
            setBadge(false);
            setPoster("Offline", false, false, true);
            break;
        case "connecting":
            setBadge(false);
            setPoster("Connecting", false, true);
            break;
        case "buffering":
            setBadge(false);
            setPoster("Buffering", false, true);
            break;
        case "reconnecting":
            setBadge(false);
            setPoster("Reconnecting", false, true);
            break;
        case "playing":
            setBadge(true);
            setPoster(null);
            break;
    }
}

export function suspendForPause(): void {
    if (ctx.pauseSuspended) return;
    if (ctx.transportKind === "ws") {
        if (!ctx.ws) return;
        ctx.pauseSuspended = true;
        ctx.ws.onmessage = null;
        ctx.ws.onclose = null;
        ctx.ws.onerror = null;
        try {
            ctx.ws.close();
        } catch {}
        ctx.ws = null;
        ctx.appendQueue = [];
        console.log("live: paused, suspending stream transport");
        return;
    }
    if (ctx.transportKind === "hls-js") {
        if (!stopHlsLoad()) return;
        ctx.pauseSuspended = true;
        console.log("live: paused, suspending hls loading");
    }
}

export function fullTeardown(): void {
    stopChase();
    stopHLSBeacon();
    destroyHls();
    clearWaitingTimer();
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
    ctx.pauseSuspended = false;
    if (ctx.objectUrl) {
        URL.revokeObjectURL(ctx.objectUrl);
        ctx.objectUrl = null;
    }
    runGenCleanup();
    video.pause();
    video.removeAttribute("src");
    video.load();
    setBadge(false);
    setViewers(null);
    ctx.behindLive = false;
    resetSeekDrag();
    ctx.quotaKeepS = PRUNE_KEEP_S;
    ctx.quotaFailStreak = 0;
    seekBarEl.hidden = true;
    behindReadoutEl.hidden = true;
    btnLiveChip.hidden = true;
    btnClip.hidden = true;
}

export function goOffline(g: number): void {
    if (ctx.state !== "offline") resetRetryBackoff();
    resetStreamInfo();
    ctx.qualityLadder = [];
    ctx.qualityLadderKnown = false;
    ctx.activeQuality = QUALITY_SOURCE;
    ctx.requestedQuality = QUALITY_SOURCE;
    renderQualityMenu();
    setState("offline");
    scheduleRestart(nextRetryDelay(), g);
}

async function verifyChannelLive(g: number): Promise<void> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`);
        if (!isCurrent(g) || !res.ok) return;
        const info = await res.json() as { live?: unknown };
        if (!isCurrent(g)) return;
        if (info.live === false && ctx.state === "reconnecting") goOffline(g);
    } catch {}
}

export function restartAfterFailure(g: number): void {
    if (!isCurrent(g)) return;
    fullTeardown();
    setState("reconnecting");
    scheduleRestart(nextRetryDelay(), g);
    void verifyChannelLive(g);
}

export function beginTransport(): void {
    if (ctx.terminal || ctx.transportKind === "none") return;
    startHealthTimer();
    clearRetryTimer();
    ctx.pauseSuspended = false;
    const g = nextGen();
    const adoption = ctx.adopt;
    if (adoption && ctx.transportKind === "ws") {
        ctx.adopt = null;
        ctx.lastStateChangeAt = Date.now();
        ctx.lastMediaArrivalAt = Date.now();
        ctx.lastProgressAt = Date.now();
        ctx.lastObservedTime = video.currentTime;
        ctx.startedOnce = true;
        adoptWSTransport(g, adoption);
        return;
    }
    ctx.adopt = null;
    fullTeardown();
    ctx.lastStateChangeAt = Date.now();
    ctx.lastMediaArrivalAt = Date.now();
    ctx.lastProgressAt = Date.now();
    ctx.lastObservedTime = video.currentTime;
    if (!ctx.startedOnce || (ctx.state !== "offline" && ctx.state !== "reconnecting")) {
        setState("connecting");
    }
    ctx.startedOnce = true;
    if (ctx.transportKind === "ws") startWSTransport(g);
    else if (ctx.transportKind === "hls-native" || ctx.transportKind === "hls-js") startHLSTransport(g);
}

let pageHideTornDown = false;

export function wirePageLifecycle(): void {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") healthCheck();
    });
    window.addEventListener("online", () => healthCheck());
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
