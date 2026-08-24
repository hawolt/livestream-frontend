import { btnPlay, clipTimeEl, clipUnmuteEl, seekBarEl, seekProgressEl, seekThumbEl, seekTrackEl, stageEl, video } from "../dom.ts";
import { isInteractiveTarget, updatePlayIcon, updateVolumeUI, wireChatAndLayoutChrome, wireFullscreenControl, wireKeyboardShortcuts, wireVolumeControl } from "../controls.ts";
import { clampClipTime, formatClipTime, seekTimeFromFraction } from "./time.ts";
import { ctx } from "../player/context.ts";
import { wireWatchBeacon } from "../watch-beacon.ts";

let clipPlayerWired = false;
let seekDragging = false;

function clipDuration(): number {
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
}

function toggleClipPlayback(): void {
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
}

export function updateClipSeekUI(): void {
    const duration = clipDuration();
    const pos = clampClipTime(video.currentTime, duration);
    const pct = duration > 0 ? (pos / duration) * 100 : 0;
    seekProgressEl.style.width = `${pct}%`;
    seekThumbEl.style.left = `${pct}%`;
    clipTimeEl.textContent = `${formatClipTime(pos)} / ${formatClipTime(duration)}`;
}

function seekFractionFromEvent(ev: PointerEvent): number {
    const rect = seekTrackEl.getBoundingClientRect();
    return rect.width > 0 ? (ev.clientX - rect.left) / rect.width : 0;
}

function applyClipSeekFraction(fraction: number): void {
    const duration = clipDuration();
    if (duration <= 0) return;
    video.currentTime = clampClipTime(seekTimeFromFraction(fraction, duration), duration);
    updateClipSeekUI();
}

function seekClipBy(deltaSeconds: number): void {
    const duration = clipDuration();
    if (duration <= 0) return;
    video.currentTime = clampClipTime(video.currentTime + deltaSeconds, duration);
    updateClipSeekUI();
}

export function wireClipPlayer(): void {
    if (clipPlayerWired) return;
    clipPlayerWired = true;

    wireChatAndLayoutChrome();
    wireVolumeControl();
    wireFullscreenControl();

    updatePlayIcon();
    updateClipSeekUI();

    btnPlay.addEventListener("click", toggleClipPlayback);
    video.addEventListener("play", updatePlayIcon);
    video.addEventListener("pause", updatePlayIcon);
    video.addEventListener("timeupdate", () => {
        if (!seekDragging) updateClipSeekUI();
    });
    video.addEventListener("loadedmetadata", updateClipSeekUI);
    video.addEventListener("durationchange", updateClipSeekUI);
    video.addEventListener("click", (ev) => {
        if (ev.target === video) toggleClipPlayback();
    });
    wireWatchBeacon(video, "clip", () => ctx.username);

    const onDown = (ev: PointerEvent) => {
        seekDragging = true;
        try {
            seekTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
        applyClipSeekFraction(seekFractionFromEvent(ev));
    };
    const onMove = (ev: PointerEvent) => {
        if (!seekDragging) return;
        applyClipSeekFraction(seekFractionFromEvent(ev));
    };
    const onUp = (ev: PointerEvent) => {
        if (!seekDragging) return;
        seekDragging = false;
        try {
            seekTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    seekTrackEl.addEventListener("pointerdown", onDown);
    seekTrackEl.addEventListener("pointermove", onMove);
    seekTrackEl.addEventListener("pointerup", onUp);
    seekTrackEl.addEventListener("pointercancel", onUp);

    wireKeyboardShortcuts();
    document.addEventListener("keydown", (ev) => {
        if (ev.defaultPrevented || ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        if (isInteractiveTarget(ev.target)) return;
        if (ev.key === "ArrowLeft") {
            ev.preventDefault();
            seekClipBy(-5);
        } else if (ev.key === "ArrowRight") {
            ev.preventDefault();
            seekClipBy(5);
        }
    });
}

export function attemptClipAutoplay(): void {
    video.play().then(() => {
        if (video.muted) showUnmuteOverlay();
    }).catch(() => {
        video.muted = true;
        updateVolumeUI();
        video.play().then(() => {
            showUnmuteOverlay();
        }).catch(() => {
            video.muted = false;
            updateVolumeUI();
            updatePlayIcon();
        });
    });
}

function showUnmuteOverlay(): void {
    clipUnmuteEl.hidden = false;
}

export function wireClipUnmute(): void {
    clipUnmuteEl.addEventListener("click", () => {
        video.muted = false;
        clipUnmuteEl.hidden = true;
        updateVolumeUI();
    });
    video.addEventListener("volumechange", () => {
        if (!video.muted) clipUnmuteEl.hidden = true;
    });
}

export function showClipControls(): void {
    stageEl.classList.remove("terminal");
    seekBarEl.hidden = false;
    clipTimeEl.hidden = false;
    updateClipSeekUI();
}

export function hideClipControls(): void {
    stageEl.classList.add("terminal");
    seekBarEl.hidden = true;
    clipTimeEl.hidden = true;
}
