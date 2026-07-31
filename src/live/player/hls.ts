import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS, HLS_HOST_ID_KEY } from "../constants.ts";
import { readLocalStorage, writeLocalStorage } from "../../storage.ts";
import { captchaQuery, getCaptchaToken } from "../../captcha.ts";
import { beginTransport, enterTerminal, goOffline, resetRetryBackoff, setState } from "./lifecycle.ts";
import { withCaptchaHint } from "./ws.ts";
import { attachVideoFailureListeners } from "./health.ts";

let viewerId = "";

export function getViewerId(): string {
    if (viewerId) return viewerId;
    const stored = readLocalStorage(HLS_HOST_ID_KEY);
    if (stored && /^[0-9a-f]{16}$/.test(stored)) {
        viewerId = stored;
        return viewerId;
    }
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    viewerId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocalStorage(HLS_HOST_ID_KEY, viewerId);
    return viewerId;
}

function sendHLSBeat(): void {
    void captchaQuery().then((tq) => {
        const url = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/beat?id=${encodeURIComponent(getViewerId())}${tq}`;
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
        sendHLSBeat();
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
