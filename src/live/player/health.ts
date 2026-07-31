import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HEALTH_CHECK_INTERVAL_MS, HEALTH_STALE_MS, HEALTH_STUCK_MS, WAITING_STALL_MS } from "../constants.ts";
import { beginTransport, clearRetryTimer, restartAfterFailure } from "./lifecycle.ts";
import { recordStall } from "./abr.ts";

let waitingTimer: number | null = null;

export function clearWaitingTimer(): void {
    if (waitingTimer !== null) {
        window.clearTimeout(waitingTimer);
        waitingTimer = null;
    }
}

export function healthRestart(reason: string): void {
    if (ctx.terminal) return;
    console.log("live: health check restart:", reason);
    clearRetryTimer();
    beginTransport();
}

export function healthCheck(): void {
    if (ctx.terminal) return;
    const now = Date.now();
    if (ctx.state === "playing") {
        if (video.paused) return;
        const mediaStale = ctx.transportKind === "ws" && now - ctx.lastMediaArrivalAt > HEALTH_STALE_MS;
        const progressStale = !video.paused && now - ctx.lastProgressAt > HEALTH_STALE_MS;
        if (mediaStale || progressStale) healthRestart("stale-playing");
        return;
    }
    const awaitingTransport = ctx.state === "connecting"
        || ctx.state === "buffering"
        || ctx.state === "reconnecting"
        || (ctx.state === "offline" && ctx.startedOnce);
    if (awaitingTransport && now - ctx.lastStateChangeAt > HEALTH_STUCK_MS) healthRestart(`stuck-${ctx.state}`);
}

let healthTimer: number | null = null;

export function startHealthTimer(): void {
    if (healthTimer !== null) return;
    healthTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") healthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopHealthTimer(): void {
    if (healthTimer === null) return;
    window.clearInterval(healthTimer);
    healthTimer = null;
}

export function attachVideoFailureListeners(g: number): void {
    const onError = () => {
        if (!isCurrent(g)) return;
        console.warn("live: video error, restarting");
        restartAfterFailure(g);
    };
    const onStalled = () => {
        if (!isCurrent(g)) return;
        console.warn("live: video stalled, restarting");
        restartAfterFailure(g);
    };
    const onWaiting = () => {
        if (!isCurrent(g)) return;
        recordStall();
        clearWaitingTimer();
        waitingTimer = window.setTimeout(() => {
            waitingTimer = null;
            if (!isCurrent(g)) return;
            if (video.readyState < 3) restartAfterFailure(g);
        }, WAITING_STALL_MS);
    };
    const onRecovered = () => clearWaitingTimer();

    video.addEventListener("error", onError);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onRecovered);
    video.addEventListener("canplay", onRecovered);

    track(() => video.removeEventListener("error", onError));
    track(() => video.removeEventListener("stalled", onStalled));
    track(() => video.removeEventListener("waiting", onWaiting));
    track(() => video.removeEventListener("playing", onRecovered));
    track(() => video.removeEventListener("canplay", onRecovered));
    track(clearWaitingTimer);
}
