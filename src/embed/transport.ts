import Hls from "hls.js";
import { video } from "./dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS, TRANSPORT_STORAGE_KEY } from "./constants.ts";
import { captchaQuery, getCaptchaToken } from "../captcha.ts";
import { ensureViewerId } from "../player-shared/viewer-id.ts";
import { needsCredentials } from "../player-shared/needs-credentials.ts";
import { mediaWsUrl as sharedMediaWsUrl } from "../player-shared/ws-url.ts";
import { chooseTransport } from "../player-shared/transport-choice.ts";
import { chooseTransportBase, markDirectFailed, shouldMarkDirectFailed } from "../player-shared/transport-fallback.ts";
import { readLocalStorage } from "../storage.ts";
import { beginTransport, enterTerminal, goOffline, resetRetryBackoff, restartAfterFailure, setPlaying } from "./lifecycle.ts";
import { attachMediaSource, pump } from "./mse.ts";
import { attachVideoFailureListeners } from "./health.ts";

function mediaWsUrl(base: string, path: string): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return sharedMediaWsUrl(base, path, `${proto}://${location.host}`, location.protocol);
}

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

export function mseSupported(): boolean {
    return typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function";
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

export function fallbackFromMSE(g: number): void {
    if (!isCurrent(g)) return;
    if (canUseNativeHLS()) {
        ctx.transportKind = "hls-native";
    } else if (canUseHlsJs()) {
        ctx.transportKind = "hls-js";
    } else {
        enterTerminal("Playback not supported");
        return;
    }
    beginTransport();
}

function handleWSClose(g: number, ev: CloseEvent, direct: boolean, joined: boolean): void {
    if (shouldMarkDirectFailed(direct, joined)) {
        markDirectFailed(ctx.wssBase);
        restartAfterFailure(g, true);
        return;
    }
    if (ev.code === 4428) {
        ctx.llDenied = true;
        const next = chooseTransport({
            mseSupported: mseSupported(),
            nativeHls: canUseNativeHLS(),
            hlsJsSupported: canUseHlsJs(),
            lowLatency: false,
            llDenied: true,
            override: readLocalStorage(TRANSPORT_STORAGE_KEY),
        });
        if (next === "unsupported") {
            enterTerminal("Playback not supported");
            return;
        }
        ctx.transportKind = next;
        restartAfterFailure(g, true);
        return;
    }
    if (ev.code === 4404 || ev.code === 1000) {
        goOffline(g);
    } else {
        restartAfterFailure(g);
    }
}

export function startWSTransport(g: number): void {
    attachVideoFailureListeners(g);
    void Promise.all([captchaQuery(), ensureViewerId(ctx.mediaBase, ctx.username)]).then(([tq, vid]) => {
        if (!isCurrent(g)) return;
        const { base, direct } = chooseTransportBase(ctx.wssBase, ctx.mediaBase);
        let joined = false;
        const path = `/ws/live?u=${encodeURIComponent(ctx.username)}&viewer_id=${encodeURIComponent(vid)}${tq}`;
        let sock: WebSocket;
        try {
            sock = new WebSocket(mediaWsUrl(base, path));
        } catch {
            restartAfterFailure(g);
            return;
        }
        ctx.ws = sock;
        sock.binaryType = "arraybuffer";

        sock.onmessage = (ev) => {
            if (!isCurrent(g)) return;
            if (typeof ev.data === "string") {
                let msg: any = {};
                try {
                    msg = JSON.parse(ev.data);
                } catch {}
                const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
                if (codecs) {
                    joined = true;
                    attachMediaSource(g, codecs);
                }
                return;
            }
            ctx.lastMediaArrivalAt = Date.now();
            ctx.appendQueue.push(ev.data as ArrayBuffer);
            pump(g);
        };

        sock.onclose = (ev) => {
            if (!isCurrent(g)) return;
            handleWSClose(g, ev, direct, joined);
        };

        sock.onerror = () => {
            if (!isCurrent(g)) return;
            try {
                sock.close();
            } catch {}
        };
    });
}

async function masterUrl(): Promise<string> {
    const tq = await captchaQuery();
    const query = tq ? `?${tq.slice(1)}` : "";
    return `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/master.m3u8${query}`;
}

function startNativeHLS(g: number, src: string): void {
    video.src = src;
    void video.play().catch(() => {});
    startHLSBeacon(g);
}

function startHlsJsPlayer(g: number, src: string): void {
    const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        liveSyncDuration: 3,
        maxLiveSyncPlaybackRate: 1.05,
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
        } else {
            startHlsJsPlayer(g, src);
        }
    });
}
