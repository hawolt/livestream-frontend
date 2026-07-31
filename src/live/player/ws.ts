import { ctx, isCurrent } from "./context.ts";
import { captchaQuery } from "../../captcha.ts";
import {
    QUALITY_SOURCE,
    isQualityOnlyFrame,
    parseQualitiesFrame,
    qualityWsParam,
    resolveNextQuality,
} from "../../quality.ts";
import { getViewerId } from "./hls.ts";
import { applyQualityList, renderQualityMenu } from "../quality-menu.ts";
import { setStreamDimensions, setStreamFps, setStreamStart, updateQuality } from "../stream-info.ts";
import { attachMediaSource, pump } from "./mse.ts";
import { attachVideoFailureListeners } from "./health.ts";
import { fullTeardown, goOffline, nextRetryDelay, scheduleRestart, setPoster, setState } from "./lifecycle.ts";
import { resetAbr } from "./abr.ts";

export function mediaWsUrl(path: string): string {
    if (ctx.mediaBase) return ctx.mediaBase.replace(/^http/, "ws") + path;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
}

export function withCaptchaHint<T>(g: number, p: Promise<T>): Promise<T> {
    const t = window.setTimeout(() => {
        if (isCurrent(g) && !ctx.terminal) setPoster("Cloudflare is checking your browser", false, true);
    }, 300);
    return p.finally(() => window.clearTimeout(t));
}

export function handleWSClose(g: number, ev: CloseEvent): void {
    const wasPlaying = ctx.state === "playing";
    const attemptedQuality = ctx.requestedQuality;
    fullTeardown();
    if (ev.code === 4404) {
        if (attemptedQuality !== QUALITY_SOURCE) {
            console.warn("live: requested quality unavailable, falling back to source");
            ctx.qualityLadder = ctx.qualityLadder.filter((q) => q !== attemptedQuality);
            ctx.activeQuality = QUALITY_SOURCE;
            ctx.requestedQuality = QUALITY_SOURCE;
            resetAbr();
            renderQualityMenu();
            setState("reconnecting");
            scheduleRestart(100, g);
            return;
        }
        console.log("live: channel offline, retrying");
        goOffline(g);
    } else if (ev.code === 4408) {
        ctx.overflowReconnects++;
        console.warn("live: viewer buffer overflow, reconnecting");
        setState("reconnecting");
        scheduleRestart(ctx.overflowReconnects <= 1 ? 100 : nextRetryDelay(), g);
    } else if (ev.code === 1000) {
        console.log(wasPlaying ? "live: stream ended, waiting for next" : "live: channel offline, retrying");
        goOffline(g);
    } else {
        console.warn("live: connection lost, retrying", ev.code);
        setState("reconnecting");
        scheduleRestart(nextRetryDelay(), g);
    }
}

export function startWSTransport(g: number): void {
    attachVideoFailureListeners(g);
    void withCaptchaHint(g, captchaQuery()).then((tq) => {
        if (!isCurrent(g)) return;
        ctx.requestedQuality = resolveNextQuality(ctx.qualityPreference, ctx.qualityLadder, ctx.qualityLadderKnown, ctx.activeQuality);
        const qParam = qualityWsParam(ctx.requestedQuality);
        const path = `/ws/live?u=${encodeURIComponent(ctx.username)}&viewer_id=${encodeURIComponent(getViewerId())}${tq}${qParam}`;
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
                if (isQualityOnlyFrame(msg)) {
                    applyQualityList(parseQualitiesFrame(msg) ?? []);
                    return;
                }
                const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
                if (!codecs) return;
                const list = parseQualitiesFrame(msg);
                if (list && applyQualityList(list)) return;
                ctx.activeQuality = ctx.requestedQuality;
                renderQualityMenu();
                if (typeof msg.started === "number" && msg.started > 0) setStreamStart(msg.started);
                if (typeof msg.fps === "number" && msg.fps > 0) setStreamFps(msg.fps);
                if (typeof msg.width === "number" && typeof msg.height === "number" && msg.width > 0) {
                    setStreamDimensions(msg.width, msg.height);
                }
                updateQuality();
                ctx.lastMediaArrivalAt = Date.now();
                attachMediaSource(g, codecs);
                return;
            }
            ctx.lastMediaArrivalAt = Date.now();
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
