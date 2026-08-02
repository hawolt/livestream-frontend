import { video } from "./dom.ts";
import { ctx, isCurrent } from "./context.ts";
import { SEEK_GAP_S, START_BEHIND_S } from "./constants.ts";
import { resetRetryBackoff, restartAfterFailure, setPlaying } from "./lifecycle.ts";

let chaseTimer: number | null = null;

export function stopChase(): void {
    if (chaseTimer !== null) {
        clearInterval(chaseTimer);
        chaseTimer = null;
    }
}

export function startChase(g: number): void {
    if (chaseTimer !== null) return;
    ctx.startedPlayback = false;
    chaseTimer = window.setInterval(() => {
        if (!isCurrent(g)) {
            stopChase();
            return;
        }
        const b = video.buffered;
        if (!b.length) return;
        const edge = b.end(b.length - 1);
        if (!ctx.startedPlayback) {
            if (edge - b.start(b.length - 1) < START_BEHIND_S) return;
            ctx.startedPlayback = true;
            video.currentTime = edge - START_BEHIND_S;
            void video.play().then(() => {
                if (!isCurrent(g)) return;
                resetRetryBackoff();
                setPlaying();
            }).catch(() => {
                if (isCurrent(g)) restartAfterFailure(g);
            });
            return;
        }
        const gap = edge - video.currentTime;
        if (gap > SEEK_GAP_S) {
            video.currentTime = edge - START_BEHIND_S;
        }
    }, 500);
}
