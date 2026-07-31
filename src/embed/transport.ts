import { video } from "./dom.ts";
import { ctx, isCurrent } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS } from "./constants.ts";
import { captchaQuery, getCaptchaToken } from "../captcha.ts";
import { getViewerId } from "../player-shared/viewer-id.ts";
import { mediaWsUrl as sharedMediaWsUrl } from "../player-shared/ws-url.ts";
import { beginTransport, enterTerminal, goOffline, resetRetryBackoff, restartAfterFailure, setPlaying } from "./lifecycle.ts";
import { attachMediaSource, pump } from "./mse.ts";

function mediaWsUrl(path: string): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return sharedMediaWsUrl(ctx.mediaBase, path, `${proto}://${location.host}`);
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

function handleWSClose(g: number, ev: CloseEvent): void {
    if (ev.code === 4404 || ev.code === 1000) {
        goOffline(g);
    } else {
        restartAfterFailure(g);
    }
}

export function startWSTransport(g: number): void {
    void captchaQuery().then((tq) => {
        if (!isCurrent(g)) return;
        const path = `/ws/live?u=${encodeURIComponent(ctx.username)}&viewer_id=${encodeURIComponent(getViewerId())}${tq}`;
        const sock = new WebSocket(mediaWsUrl(path));
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
                if (codecs) attachMediaSource(g, codecs);
                return;
            }
            ctx.appendQueue.push(ev.data as ArrayBuffer);
            pump(g);
        };

        sock.onclose = (ev) => {
            if (!isCurrent(g)) return;
            handleWSClose(g, ev);
        };

        sock.onerror = () => {
            if (!isCurrent(g)) return;
            try {
                sock.close();
            } catch {}
        };
    });
}

export function startHLSTransport(g: number): void {
    const src = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/live.m3u8`;

    const onPlaying = () => {
        if (!isCurrent(g)) return;
        resetRetryBackoff();
        setPlaying();
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        goOffline(g);
    };
    const onError = () => {
        if (!isCurrent(g)) return;
        restartAfterFailure(g);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    ctx.hlsVideoCleanup = () => {
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
    };

    void getCaptchaToken().then(() => {
        if (!isCurrent(g)) return;
        video.src = src;
        void video.play().catch(() => {});
        startHLSBeacon(g);
    });
}
