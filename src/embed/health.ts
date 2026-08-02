import { video } from "./dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HEALTH_CHECK_INTERVAL_MS, HEALTH_STALE_MS, HEALTH_STUCK_MS, WAITING_STALL_MS } from "./constants.ts";
import { decideEmbedHealth } from "./health-decision.ts";
import { restartAfterFailure } from "./lifecycle.ts";

let waitingTimer: number | null = null;
let healthTimer: number | null = null;

export function clearWaitingTimer(): void {
    if (waitingTimer === null) return;
    window.clearTimeout(waitingTimer);
    waitingTimer = null;
}

export function healthCheck(): void {
    if (ctx.terminal || document.visibilityState !== "visible") return;
    const reason = decideEmbedHealth({
        state: ctx.state,
        transportKind: ctx.transportKind,
        now: Date.now(),
        lastStateChangeAt: ctx.lastStateChangeAt,
        lastMediaArrivalAt: ctx.lastMediaArrivalAt,
        lastProgressAt: ctx.lastProgressAt,
        paused: video.paused,
        staleMs: HEALTH_STALE_MS,
        stuckMs: HEALTH_STUCK_MS,
    });
    if (reason) restartAfterFailure(ctx.gen);
}

export function startHealthTimer(): void {
    if (healthTimer !== null) return;
    healthTimer = window.setInterval(healthCheck, HEALTH_CHECK_INTERVAL_MS);
}

export function stopHealthTimer(): void {
    if (healthTimer === null) return;
    window.clearInterval(healthTimer);
    healthTimer = null;
}

export function attachVideoFailureListeners(g: number): void {
    const onError = () => {
        if (isCurrent(g)) restartAfterFailure(g);
    };
    const onWaiting = () => {
        if (!isCurrent(g)) return;
        clearWaitingTimer();
        const waitingAt = video.currentTime;
        waitingTimer = window.setTimeout(() => {
            waitingTimer = null;
            if (!isCurrent(g)) return;
            const hasProgressed = Math.abs(video.currentTime - waitingAt) > 0.01;
            if (!hasProgressed || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) restartAfterFailure(g);
        }, WAITING_STALL_MS);
    };
    const onProgress = () => {
        if (!isCurrent(g)) return;
        if (Math.abs(video.currentTime - ctx.lastObservedTime) > 0.01) {
            ctx.lastObservedTime = video.currentTime;
            ctx.lastProgressAt = Date.now();
        }
        clearWaitingTimer();
    };

    video.addEventListener("error", onError);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onProgress);
    video.addEventListener("canplay", onProgress);
    video.addEventListener("timeupdate", onProgress);

    track(() => video.removeEventListener("error", onError));
    track(() => video.removeEventListener("stalled", onWaiting));
    track(() => video.removeEventListener("waiting", onWaiting));
    track(() => video.removeEventListener("playing", onProgress));
    track(() => video.removeEventListener("canplay", onProgress));
    track(() => video.removeEventListener("timeupdate", onProgress));
    track(clearWaitingTimer);
}
