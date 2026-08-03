import { videoEl } from "./dom.ts";
import { state } from "./context.ts";
import { renderTimeline } from "./timeline-render.ts";

export function currentPlayheadMs(): number {
    return videoEl.currentTime * 1000;
}

function clampPlayheadMs(ms: number): number {
    return Math.min(state.nowMs, Math.max(state.mediaStartMs, ms));
}

export function seekTo(ms: number): void {
    const clamped = clampPlayheadMs(ms);
    try {
        videoEl.currentTime = clamped / 1000;
    } catch {}
    renderTimeline(clamped);
}
