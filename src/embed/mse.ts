import { video } from "./dom.ts";
import { ctx, isCurrent } from "./context.ts";
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
            const b = video.buffered;
            if (b.length && ctx.sourceBuffer && !ctx.sourceBuffer.updating) {
                try {
                    ctx.sourceBuffer.remove(0, Math.max(b.start(0) + 1, video.currentTime - 5));
                } catch {}
            }
        } else {
            restartAfterFailure(g);
        }
    }
}

export function attachMediaSource(g: number, codecs: string): void {
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
        sb.mode = "segments";
        sb.addEventListener("updateend", () => {
            if (!isCurrent(g)) return;
            pruneBuffer();
            pump(g);
        });
        ctx.sourceBuffer = sb;
        pump(g);
        startChase(g);
    };
    ms.addEventListener("sourceopen", onSourceOpen, { once: true });
}
