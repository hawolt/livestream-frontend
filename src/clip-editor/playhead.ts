import { videoEl } from "./dom.ts";
import { state } from "./context.ts";
import { renderTimeline } from "./timeline-render.ts";
import { currentTimeFromMediaMs, mediaMsFromCurrentTime } from "./media-timeline.ts";

export function currentPlayheadMs(): number {
    return mediaMsFromCurrentTime(videoEl.currentTime, state.mediaStartMs);
}

function clampPlayheadMs(ms: number): number {
    return Math.min(state.nowMs, Math.max(state.mediaStartMs, ms));
}

export function seekTo(ms: number): void {
    const clamped = clampPlayheadMs(ms);
    try {
        videoEl.currentTime = currentTimeFromMediaMs(clamped, state.mediaStartMs);
    } catch {}
    renderTimeline(clamped);
}
