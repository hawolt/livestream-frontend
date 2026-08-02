import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { PRUNE_KEEP_S, QUOTA_TRIM_FLOOR_S } from "../constants.ts";
import { quotaTrimOnCleanAppend, quotaTrimOnFailure } from "./quota.ts";
import { fallbackFromMSE } from "./hls.ts";
import { restartAfterFailure, setState } from "./lifecycle.ts";
import { startChase } from "./chase.ts";

export function bufferedEnd(): number {
    const b = video.buffered;
    return b.length ? b.end(b.length - 1) : 0;
}

export function bufferedStart(): number {
    const b = video.buffered;
    return b.length ? b.start(b.length - 1) : 0;
}

export function pruneBuffer(): void {
    if (!ctx.sourceBuffer || ctx.sourceBuffer.updating) return;
    const b = video.buffered;
    if (!b.length) return;
    const ref = video.paused ? b.end(b.length - 1) : video.currentTime;
    const cutoff = ref - PRUNE_KEEP_S;
    if (cutoff > b.start(0) + 5) {
        try {
            ctx.sourceBuffer.remove(0, cutoff);
        } catch {}
    }
}

export function pump(g: number): void {
    if (!isCurrent(g)) return;
    if (!ctx.sourceBuffer || ctx.sourceBuffer.updating || !ctx.appendQueue.length) return;
    const chunk = ctx.appendQueue.shift()!;
    try {
        ctx.sourceBuffer.appendBuffer(chunk);
        const trimmed = quotaTrimOnCleanAppend(PRUNE_KEEP_S);
        ctx.quotaFailStreak = trimmed.failStreak;
        ctx.quotaKeepS = trimmed.keepS;
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            ctx.appendQueue.unshift(chunk);
            const b = video.buffered;
            let recoveryStarted = false;
            if (b.length && ctx.sourceBuffer && !ctx.sourceBuffer.updating) {
                const trimmed = quotaTrimOnFailure({ keepS: ctx.quotaKeepS, failStreak: ctx.quotaFailStreak }, QUOTA_TRIM_FLOOR_S);
                ctx.quotaFailStreak = trimmed.failStreak;
                ctx.quotaKeepS = trimmed.keepS;
                const ref = video.paused ? b.end(b.length - 1) : video.currentTime;
                const target = Math.max(b.start(0) + 1, ref - ctx.quotaKeepS);
                try {
                    ctx.sourceBuffer.remove(0, target);
                    recoveryStarted = true;
                } catch {}
            }
            if (!recoveryStarted) restartAfterFailure(g);
        } else {
            console.warn("live: source buffer append failed, restarting player", e);
            restartAfterFailure(g);
        }
    }
}

export function attachMediaSource(g: number, codecs: string): void {
    if (ctx.mediaSource) return;
    const mime = `video/mp4; codecs="${codecs}"`;
    if (!MediaSource.isTypeSupported(mime)) {
        console.warn("live: unsupported codecs", codecs);
        fallbackFromMSE(g);
        return;
    }
    const ms = new MediaSource();
    ctx.mediaSource = ms;
    const url = URL.createObjectURL(ms);
    ctx.objectUrl = url;
    video.src = url;
    const onSourceOpen = () => {
        if (!isCurrent(g) || ctx.mediaSource !== ms) return;
        if (ctx.objectUrl) {
            URL.revokeObjectURL(ctx.objectUrl);
            ctx.objectUrl = null;
        }
        let sb: SourceBuffer;
        try {
            sb = ms.addSourceBuffer(mime);
        } catch (e) {
            if (e instanceof DOMException && e.name === "NotSupportedError") {
                fallbackFromMSE(g);
                return;
            }
            console.warn("live: add source buffer failed, restarting player", e);
            restartAfterFailure(g);
            return;
        }
        sb.mode = "segments";
        const onUpdateEnd = () => {
            if (!isCurrent(g)) return;
            pruneBuffer();
            pump(g);
        };
        sb.addEventListener("updateend", onUpdateEnd);
        track(() => sb.removeEventListener("updateend", onUpdateEnd));
        ctx.sourceBuffer = sb;
        setState("buffering");
        pump(g);
        startChase(g);
    };
    ms.addEventListener("sourceopen", onSourceOpen, { once: true });
    track(() => ms.removeEventListener("sourceopen", onSourceOpen));
}
