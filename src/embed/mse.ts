import { video } from "./dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { PRUNE_KEEP_S } from "./constants.ts";
import { restartAfterFailure } from "./lifecycle.ts";
import { fallbackFromMSE } from "./transport.ts";
import { startChase } from "./chase.ts";

export function pruneBuffer(): void {
    if (!ctx.sourceBuffer || ctx.sourceBuffer.updating) return;
    const b = video.buffered;
    if (!b.length) return;
    const cutoff = video.currentTime - PRUNE_KEEP_S;
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
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            ctx.appendQueue.unshift(chunk);
            const b = ctx.sourceBuffer.buffered;
            let recoveryStarted = false;
            if (b.length && ctx.sourceBuffer && !ctx.sourceBuffer.updating) {
                const start = b.start(0);
                const end = Math.min(b.end(0), Math.max(start + 1, video.currentTime - 5));
                try {
                    if (end > start) {
                        ctx.sourceBuffer.remove(0, end);
                        recoveryStarted = true;
                    }
                } catch {}
            }
            if (!recoveryStarted) restartAfterFailure(g);
        } else {
            restartAfterFailure(g);
        }
    }
}

export function attachMediaSource(g: number, codecs: string): void {
    if (ctx.mediaSource) return;
    const mime = `video/mp4; codecs="${codecs}"`;
    if (!MediaSource.isTypeSupported(mime)) {
        fallbackFromMSE(g);
        return;
    }
    const ms = new MediaSource();
    ctx.mediaSource = ms;
    const url = URL.createObjectURL(ms);
    ctx.objectUrl = url;
    video.src = url;
    const onMediaSourceFailure = () => {
        if (isCurrent(g) && ctx.mediaSource === ms) restartAfterFailure(g);
    };
    const onSourceOpen = () => {
        if (!isCurrent(g) || ctx.mediaSource !== ms) return;
        if (ctx.objectUrl) {
            URL.revokeObjectURL(ctx.objectUrl);
            ctx.objectUrl = null;
        }
        let sb: SourceBuffer;
        try {
            sb = ms.addSourceBuffer(mime);
        } catch (error) {
            if (error instanceof DOMException && error.name === "NotSupportedError") {
                fallbackFromMSE(g);
                return;
            }
            restartAfterFailure(g);
            return;
        }
        ctx.sourceBuffer = sb;
        try {
            sb.mode = "segments";
        } catch {
            restartAfterFailure(g);
            return;
        }
        const onUpdateEnd = () => {
            if (!isCurrent(g)) return;
            pruneBuffer();
            pump(g);
        };
        const onSourceBufferFailure = () => {
            if (isCurrent(g) && ctx.sourceBuffer === sb) restartAfterFailure(g);
        };
        sb.addEventListener("updateend", onUpdateEnd);
        sb.addEventListener("error", onSourceBufferFailure);
        sb.addEventListener("abort", onSourceBufferFailure);
        track(() => sb.removeEventListener("updateend", onUpdateEnd));
        track(() => sb.removeEventListener("error", onSourceBufferFailure));
        track(() => sb.removeEventListener("abort", onSourceBufferFailure));
        pump(g);
        startChase(g);
    };
    ms.addEventListener("sourceopen", onSourceOpen, { once: true });
    ms.addEventListener("sourceclose", onMediaSourceFailure);
    ms.addEventListener("sourceended", onMediaSourceFailure);
    track(() => ms.removeEventListener("sourceopen", onSourceOpen));
    track(() => ms.removeEventListener("sourceclose", onMediaSourceFailure));
    track(() => ms.removeEventListener("sourceended", onMediaSourceFailure));
}
