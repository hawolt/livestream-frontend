import { video } from "../dom.ts";
import { ctx, isCurrent } from "./context.ts";
import { CHASE_GAP_S, CHASE_RATE, CHASE_STOP_S, SEEK_GAP_S, START_BEHIND_S } from "../constants.ts";
import { decideChase } from "./chase-decision.ts";
import { resetRetryBackoff, setState } from "./lifecycle.ts";
import { updateInfoBar } from "../stream-info.ts";
import { updateSeekBar } from "../seekbar.ts";

const GUARD_OFFSET_S = 3;

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
            ctx.overflowReconnects = 0;
            resetRetryBackoff();
            video.currentTime = edge - START_BEHIND_S;
            void video.play().catch(() => {});
            setState("playing");
        }
        updateInfoBar();
        if (video.paused) {
            updateSeekBar();
            return;
        }
        const bufferedStartAt = b.start(b.length - 1);
        const decision = decideChase({
            behindLive: ctx.behindLive,
            edge,
            currentTime: video.currentTime,
            bufferedStart: bufferedStartAt,
            seekGapS: SEEK_GAP_S,
            chaseGapS: CHASE_GAP_S,
            chaseStopS: CHASE_STOP_S,
            guardOffsetS: GUARD_OFFSET_S,
        });
        if (decision === "snap") {
            video.currentTime = edge - START_BEHIND_S;
            video.playbackRate = 1;
        } else if (decision === "chase-rate") {
            video.playbackRate = CHASE_RATE;
        } else if (decision === "normal-rate") {
            video.playbackRate = 1;
        } else if (decision === "guard-snap") {
            video.currentTime = Math.min(edge, bufferedStartAt + GUARD_OFFSET_S + 1);
        }
        updateSeekBar();
    }, 500);
}
