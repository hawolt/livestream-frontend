import { ctx, isCurrent, track } from "./context.ts";
import type { AdoptedTransport } from "./adoption.ts";
import { captchaChallengeActive, captchaQuery } from "../../captcha.ts";
import {
    QUALITY_SOURCE,
    allowedSubset,
    highestAllowed,
    isQualityLockedFrame,
    isQualityOnlyFrame,
    parseLockedList,
    parseQualitiesFrame,
    qualityWsParam,
    resolveNextQuality,
    streamQualityText,
} from "../../quality.ts";
import { closeQualityUpsell, enterQualityLockedTerminal } from "../quality-upsell.ts";
import { ensureViewerId } from "../../player-shared/viewer-id.ts";
import { applyQualityList, renderQualityMenu } from "../quality-menu.ts";
import { setStreamDimensions, setStreamFps, setStreamStart, updateQuality } from "../stream-info.ts";
import { attachMediaSource, pruneBuffer, pump } from "./mse.ts";
import { startChase } from "./chase.ts";
import { attachVideoFailureListeners } from "./health.ts";
import { fullTeardown, goOffline, nextRetryDelay, renderPlayerUI, restartAfterFailure, scheduleRestart, setPoster, setState } from "./lifecycle.ts";
import { mediaWsUrl as sharedMediaWsUrl } from "../../player-shared/ws-url.ts";
import { chooseTransportBase, markDirectFailed, shouldMarkDirectFailed } from "../../player-shared/transport-fallback.ts";

export function mediaWsUrl(base: string, path: string): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return sharedMediaWsUrl(base, path, `${proto}://${location.host}`, location.protocol);
}

export function withCaptchaHint<T>(g: number, p: Promise<T>): Promise<T> {
    const hint = captchaChallengeActive() ? "Cloudflare is checking your browser" : "Checking access";
    const t = window.setTimeout(() => {
        if (isCurrent(g) && !ctx.terminal) setPoster(hint, false, true);
    }, 300);
    return p.finally(() => window.clearTimeout(t));
}

export function handleWSClose(g: number, ev: CloseEvent, direct = false, joined = true): void {
    const wasPlaying = ctx.state === "playing";
    const attemptedQuality = ctx.requestedQuality;
    fullTeardown();
    if (shouldMarkDirectFailed(direct, joined)) {
        markDirectFailed(ctx.wssBase);
        setState("reconnecting");
        scheduleRestart(100, g);
        return;
    }
    if (ev.code === 4427) {
        const next = highestAllowed(ctx.qualityLadder, ctx.lockedQualities);
        if (next && next !== attemptedQuality) {
            console.warn("live: quality locked, switching to", next);
            ctx.qualityPreference = next;
            ctx.activeQuality = next;
            ctx.requestedQuality = next;
            renderQualityMenu();
            setState("reconnecting");
            scheduleRestart(100, g);
            return;
        }
        console.warn("live: every quality locked for this viewer");
        enterQualityLockedTerminal();
        return;
    }
    if (ev.code === 4404) {
        if (attemptedQuality !== QUALITY_SOURCE) {
            console.warn("live: requested quality unavailable, falling back to source");
            ctx.qualityLadder = ctx.qualityLadder.filter((q) => q !== attemptedQuality);
            ctx.activeQuality = QUALITY_SOURCE;
            ctx.requestedQuality = QUALITY_SOURCE;
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

export function adoptWSTransport(g: number, a: AdoptedTransport): void {
    attachVideoFailureListeners(g);
    ctx.ws = a.sock;
    ctx.mediaSource = a.mediaSource;
    ctx.sourceBuffer = a.sourceBuffer;
    ctx.appendQueue = a.queue;
    ctx.activeQuality = QUALITY_SOURCE;
    ctx.requestedQuality = QUALITY_SOURCE;
    renderQualityMenu();
    const sb = a.sourceBuffer;
    const onUpdateEnd = (): void => {
        if (!isCurrent(g)) return;
        pruneBuffer();
        pump(g);
    };
    sb.addEventListener("updateend", onUpdateEnd);
    track(() => sb.removeEventListener("updateend", onUpdateEnd));
    a.sock.onmessage = (ev) => {
        if (!isCurrent(g)) return;
        if (typeof ev.data === "string") {
            let msg: any = {};
            try {
                msg = JSON.parse(ev.data);
            } catch {}
            if (isQualityOnlyFrame(msg)) {
                const list = parseQualitiesFrame(msg);
                if (list && list.length) applyQualityList(list);
            }
            return;
        }
        ctx.lastMediaArrivalAt = Date.now();
        ctx.appendQueue.push(ev.data as ArrayBuffer);
        pump(g);
    };
    a.sock.onclose = (ev) => {
        if (!isCurrent(g)) return;
        handleWSClose(g, ev, false, true);
    };
    a.sock.onerror = () => {
        if (!isCurrent(g)) return;
        try {
            a.sock.close();
        } catch {}
    };
    if (a.started > 0) setStreamStart(a.started);
    if (a.fps > 0) setStreamFps(a.fps);
    if (a.width > 0 && a.height > 0) setStreamDimensions(a.width, a.height);
    updateQuality();
    ctx.lastMediaArrivalAt = Date.now();
    setState("playing");
    renderPlayerUI();
    startChase(g);
    pump(g);
}

export function startWSTransport(g: number): void {
    attachVideoFailureListeners(g);
    closeQualityUpsell();
    void Promise.all([withCaptchaHint(g, captchaQuery()), ensureViewerId(ctx.mediaBase, ctx.username)]).then(([tq, vid]) => {
        if (!isCurrent(g)) return;
        ctx.requestedQuality = resolveNextQuality(ctx.qualityPreference,
            allowedSubset(ctx.qualityLadder, ctx.lockedQualities), ctx.qualityLadderKnown, ctx.activeQuality);
        const qParam = qualityWsParam(ctx.requestedQuality);
        const { base, direct } = chooseTransportBase(ctx.wssBase, ctx.mediaBase);
        let joined = false;
        const path = `/ws/live?u=${encodeURIComponent(ctx.username)}&viewer_id=${encodeURIComponent(vid)}${tq}${qParam}`;
        let sock: WebSocket;
        try {
            sock = new WebSocket(mediaWsUrl(base, path));
        } catch (e) {
            console.warn("live: websocket construction failed, restarting player", e);
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
                if (isQualityLockedFrame(msg)) {
                    const list = parseQualitiesFrame(msg);
                    if (list && list.length) {
                        ctx.qualityLadder = list;
                        ctx.qualityLadderKnown = true;
                    }
                    ctx.lockedQualities = parseLockedList(msg);
                    ctx.lockedStreamLabel = streamQualityText(
                        typeof msg.width === "number" ? msg.width : 0,
                        typeof msg.height === "number" ? msg.height : 0,
                        typeof msg.fps === "number" ? msg.fps : 0);
                    joined = true;
                    return;
                }
                if (isQualityOnlyFrame(msg)) {
                    const list = parseQualitiesFrame(msg);
                    if (list && list.length) applyQualityList(list);
                    return;
                }
                const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
                if (!codecs) return;
                ctx.lockedQualities = parseLockedList(msg);
                const list = parseQualitiesFrame(msg);
                if (list && applyQualityList(list)) return;
                joined = true;
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
