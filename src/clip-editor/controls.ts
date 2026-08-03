import { bodyEl, btnMuteEl, btnPlayPauseEl, btnPlaySelectionEl, btnSetInEl, btnSetOutEl, videoEl, volumeEl } from "./dom.ts";
import { MAX_SPAN_MS, MIN_SPAN_MS, state } from "./context.ts";
import { clampSelection } from "./clamp.ts";
import { renderTimeline } from "./timeline-render.ts";
import { currentPlayheadMs, seekTo } from "./playhead.ts";
import { flashToggleIcon, updatePlayPauseIcon, updateVolumeUI } from "./playback-ui.ts";
import { currentTimeFromMediaMs } from "./media-timeline.ts";

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
}

function playSelection(): void {
    stopSelectionPlayback();
    seekTo(state.selectionStartMs);
    const outSeconds = currentTimeFromMediaMs(state.selectionEndMs, state.mediaStartMs);
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

function isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest(
        "a[href], button, input, select, textarea, [contenteditable]:not([contenteditable=false]), [role=button], [role=link], [role=slider], [role=textbox], [role=menuitem]",
    ) !== null;
}

function isMutedState(): boolean {
    return videoEl.muted || videoEl.volume === 0;
}

export function wirePlaybackControls(): void {
    videoEl.addEventListener("click", () => {
        if (state.phase === "loading-media") return;
        togglePlayPause();
        flashToggleIcon();
        videoEl.blur();
    });
    videoEl.addEventListener("timeupdate", () => renderTimeline(currentPlayheadMs()));
    videoEl.addEventListener("play", () => {
        renderTimeline(currentPlayheadMs());
        updatePlayPauseIcon();
    });
    videoEl.addEventListener("pause", () => {
        renderTimeline(currentPlayheadMs());
        updatePlayPauseIcon();
    });

    btnSetInEl.addEventListener("click", () => setSelectionStart(currentPlayheadMs()));
    btnSetOutEl.addEventListener("click", () => setSelectionEnd(currentPlayheadMs()));
    btnPlaySelectionEl.addEventListener("click", () => playSelection());

    btnPlayPauseEl.addEventListener("click", () => {
        togglePlayPause();
        flashToggleIcon();
    });

    btnMuteEl.addEventListener("click", () => {
        if (isMutedState()) {
            videoEl.muted = false;
            if (videoEl.volume === 0) videoEl.volume = 0.5;
        } else {
            videoEl.muted = true;
        }
        updateVolumeUI();
    });

    volumeEl.addEventListener("input", () => {
        const v = parseFloat(volumeEl.value);
        videoEl.volume = v;
        videoEl.muted = v === 0;
        updateVolumeUI();
    });

    updatePlayPauseIcon();
    updateVolumeUI();

    document.addEventListener("keydown", (ev) => {
        if (bodyEl.hidden) return;
        if (isInteractiveTarget(ev.target)) return;
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const mediaReady = state.phase !== "loading-media";
        if (ev.key === " ") {
            if (!mediaReady) return;
            ev.preventDefault();
            togglePlayPause();
            flashToggleIcon();
            return;
        }
        if (!mediaReady) return;
        if (ev.key === "i" || ev.key === "I") {
            if (state.phase === "ready") setSelectionStart(currentPlayheadMs());
        } else if (ev.key === "o" || ev.key === "O") {
            if (state.phase === "ready") setSelectionEnd(currentPlayheadMs());
        } else if (ev.key === "ArrowLeft") {
            ev.preventDefault();
            seekTo(currentPlayheadMs() - (ev.shiftKey ? 5000 : 1000));
        } else if (ev.key === "ArrowRight") {
            ev.preventDefault();
            seekTo(currentPlayheadMs() + (ev.shiftKey ? 5000 : 1000));
        }
    });
}
