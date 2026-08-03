import { btnPlaySelectionEl, btnSetInEl, btnSetOutEl, videoEl } from "./dom.ts";
import { MAX_SPAN_MS, MIN_SPAN_MS, state } from "./context.ts";
import { clampSelection } from "./clamp.ts";
import { renderTimeline } from "./timeline-render.ts";

function currentPlayheadMs(): number {
    return videoEl.currentTime * 1000;
}

function clampPlayheadMs(ms: number): number {
    return Math.min(state.nowMs, Math.max(state.mediaStartMs, ms));
}

function seekTo(ms: number): void {
    const clamped = clampPlayheadMs(ms);
    try {
        videoEl.currentTime = clamped / 1000;
    } catch {}
    renderTimeline(clamped);
}

function setSelectionStart(ms: number): void {
    const result = clampSelection(ms, state.selectionEndMs, state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS);
    state.selectionStartMs = result.startMs;
    state.selectionEndMs = result.endMs;
    renderTimeline(currentPlayheadMs());
}

function setSelectionEnd(ms: number): void {
    const result = clampSelection(state.selectionStartMs, ms, state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS);
    state.selectionStartMs = result.startMs;
    state.selectionEndMs = result.endMs;
    renderTimeline(currentPlayheadMs());
}

function togglePlayPause(): void {
    if (videoEl.paused) void videoEl.play().catch(() => {});
    else videoEl.pause();
}

let selectionPlaybackHandler: (() => void) | null = null;

function stopSelectionPlayback(): void {
    if (selectionPlaybackHandler) {
        videoEl.removeEventListener("timeupdate", selectionPlaybackHandler);
        selectionPlaybackHandler = null;
    }
    state.playingSelection = false;
}

function playSelection(): void {
    stopSelectionPlayback();
    seekTo(state.selectionStartMs);
    state.playingSelection = true;
    const outSeconds = state.selectionEndMs / 1000;
    const handler = () => {
        if (videoEl.currentTime >= outSeconds) {
            videoEl.pause();
            stopSelectionPlayback();
        }
    };
    selectionPlaybackHandler = handler;
    videoEl.addEventListener("timeupdate", handler);
    void videoEl.play().catch(() => {});
}

function isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]:not([contenteditable=false])") !== null;
}

export function wirePlaybackControls(): void {
    videoEl.addEventListener("click", () => togglePlayPause());
    videoEl.addEventListener("timeupdate", () => {
        if (!state.playingSelection) renderTimeline(currentPlayheadMs());
    });
    videoEl.addEventListener("play", () => renderTimeline(currentPlayheadMs()));
    videoEl.addEventListener("pause", () => renderTimeline(currentPlayheadMs()));

    btnSetInEl.addEventListener("click", () => setSelectionStart(currentPlayheadMs()));
    btnSetOutEl.addEventListener("click", () => setSelectionEnd(currentPlayheadMs()));
    btnPlaySelectionEl.addEventListener("click", () => playSelection());

    document.addEventListener("keydown", (ev) => {
        if (state.phase !== "ready") return;
        if (isTypingTarget(ev.target)) return;
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        if (ev.key === " ") {
            ev.preventDefault();
            togglePlayPause();
        } else if (ev.key === "i" || ev.key === "I") {
            setSelectionStart(currentPlayheadMs());
        } else if (ev.key === "o" || ev.key === "O") {
            setSelectionEnd(currentPlayheadMs());
        } else if (ev.key === "ArrowLeft") {
            ev.preventDefault();
            seekTo(currentPlayheadMs() - (ev.shiftKey ? 5000 : 1000));
        } else if (ev.key === "ArrowRight") {
            ev.preventDefault();
            seekTo(currentPlayheadMs() + (ev.shiftKey ? 5000 : 1000));
        }
    });
}
