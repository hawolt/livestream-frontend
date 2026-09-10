import Hls from "hls.js";
import { video } from "./dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS } from "./constants.ts";
import { captchaQuery, getCaptchaToken } from "../captcha.ts";
import { ensureViewerId } from "../player-shared/viewer-id.ts";
import { needsCredentials } from "../player-shared/needs-credentials.ts";
import { goOffline, resetRetryBackoff, restartAfterFailure, setPlaying } from "./lifecycle.ts";
import { latencyTierFor } from "../live/player/latency-window.ts";
import { attachVideoFailureListeners } from "./health.ts";

function sendHLSBeat(g: number): void {
    void Promise.all([captchaQuery(), ensureViewerId(ctx.mediaBase, ctx.username)]).then(([tq, vid]) => {
        if (!isCurrent(g)) return;
        const url = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/beat?id=${encodeURIComponent(vid)}${tq}`;
        fetch(url, { method: "POST", credentials: "include" }).catch(() => {});
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

export function canUseHlsJs(): boolean {
    return Hls.isSupported();
}

let hlsInstance: Hls | null = null;

export function destroyHls(): void {
    if (hlsInstance) {
        try {
            hlsInstance.destroy();
        } catch {}
        hlsInstance = null;
    }
}

async function masterUrl(): Promise<string> {
    const tq = await captchaQuery();
    return `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/master.m3u8?prefetch=1${tq}`;
}

function startNativeHLS(g: number, src: string): void {
    video.src = src;
    void video.play().catch(() => {});
    startHLSBeacon(g);
}

function startHlsJsPlayer(g: number, src: string, rttMs: number | null): void {
    const tier = ctx.edgeServed ? "far" : latencyTierFor(rttMs, false);
    const hls = new Hls({
        lowLatencyMode: false,
        backBufferLength: 30,
        ...(tier === "far"
            ? { liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 8 }
            : tier === "near"
                ? { liveSyncDuration: 3.5, liveMaxLatencyDuration: 8 }
                : { liveSyncDuration: 5, liveMaxLatencyDuration: 12 }),
        maxLiveSyncPlaybackRate: 1,
        enableWorker: true,
        xhrSetup: (xhr, url) => {
            xhr.withCredentials = needsCredentials(url, ctx.mediaBase, location.origin);
        },
    });
    hlsInstance = hls;
    hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        if (data.details === Hls.ErrorDetails.BUFFER_FULL_ERROR) return;
        if (!data.fatal) return;
        restartAfterFailure(g);
    });
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        hls.loadSource(src);
    });
    hls.attachMedia(video);
    void video.play().catch(() => {});
    startHLSBeacon(g);
}

export function startHLSTransport(g: number): void {
    attachVideoFailureListeners(g);

    const onPlaying = () => {
        if (!isCurrent(g)) return;
        resetRetryBackoff();
        setPlaying();
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        goOffline(g);
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    track(() => video.removeEventListener("playing", onPlaying));
    track(() => video.removeEventListener("ended", onEnded));

    void getCaptchaToken().then(async () => {
        if (!isCurrent(g)) return;
        const src = await masterUrl();
        if (!isCurrent(g)) return;
        if (ctx.transportKind === "hls-native") {
            startNativeHLS(g, src);
            return;
        }
        let rttMs: number | null = null;
        try {
            await fetch(src, { credentials: "include" });
            const t0 = performance.now();
            await fetch(src, { credentials: "include" });
            rttMs = performance.now() - t0;
        } catch {}
        if (!isCurrent(g)) return;
        startHlsJsPlayer(g, src, rttMs);
    });
}
