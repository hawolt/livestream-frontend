import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS } from "../constants.ts";
import { ensureViewerId } from "../../player-shared/viewer-id.ts";
import { captchaQuery, getCaptchaToken } from "../../captcha.ts";
import { beginTransport, enterTerminal, fullTeardown, goOffline, resetRetryBackoff, setState } from "./lifecycle.ts";
import { withCaptchaHint } from "./ws.ts";
import { attachVideoFailureListeners } from "./health.ts";
import { renderQualityMenu } from "../quality-menu.ts";

function sendHLSBeat(g: number): void {
    void Promise.all([captchaQuery(), ensureViewerId(ctx.mediaBase, ctx.username)]).then(([tq, vid]) => {
        if (!isCurrent(g)) return;
        const url = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/beat?id=${encodeURIComponent(vid)}${tq}`;
        fetch(url, { method: "POST" }).catch(() => {});
    });
}

let hlsBeaconTimer: number | null = null;

export function stopHLSBeacon(): void {
    if (hlsBeaconTimer !== null) {
        window.clearInterval(hlsBeaconTimer);
        hlsBeaconTimer = null;
    }
}

export function startHLSBeacon(g: number): void {
    stopHLSBeacon();
    const beat = () => {
        if (!isCurrent(g)) {
            stopHLSBeacon();
            return;
        }
        sendHLSBeat(g);
    };
    beat();
    hlsBeaconTimer = window.setInterval(beat, HLS_BEACON_INTERVAL_MS);
}

export function canUseNativeHLS(): boolean {
    return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

export function fallbackFromMSE(g: number): void {
    if (!isCurrent(g)) return;
    if (canUseNativeHLS()) {
        ctx.transportKind = "hls";
        ctx.qualityLadder = [];
        ctx.qualityLadderKnown = false;
        renderQualityMenu();
        beginTransport();
        return;
    }
    enterTerminal("Playback not supported");
}

export function startHLSTransport(g: number): void {
    attachVideoFailureListeners(g);
    const src = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/live.m3u8`;

    const onPlaying = () => {
        if (!isCurrent(g)) return;
        ctx.lastMediaArrivalAt = Date.now();
        resetRetryBackoff();
        setState("playing");
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        console.log("live: stream ended, waiting for next");
        fullTeardown();
        goOffline(g);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    track(() => video.removeEventListener("playing", onPlaying));
    track(() => video.removeEventListener("ended", onEnded));

    setState("buffering");
    void withCaptchaHint(g, getCaptchaToken()).then(() => {
        if (!isCurrent(g)) return;
        video.src = src;
        void video.play().catch(() => {});
        startHLSBeacon(g);
    });
}
