import { btnMuteEl, btnPlayPauseEl, timeEl, toggleFlashBubbleEl, videoEl, volumeEl } from "./dom.ts";
import { state } from "./context.ts";
import { formatClipDuration } from "./format.ts";
import { iconMute, iconPause, iconPlay, iconVolume, iconVolumeLow } from "./icons.ts";

function setIcon(button: HTMLButtonElement, icon: SVGSVGElement): void {
    button.replaceChildren(icon);
}

export function updatePlayPauseIcon(): void {
    setIcon(btnPlayPauseEl, videoEl.paused ? iconPlay() : iconPause());
    const label = videoEl.paused ? "Play" : "Pause";
    btnPlayPauseEl.setAttribute("aria-label", label);
    btnPlayPauseEl.title = label;
}

function isMutedState(): boolean {
    return videoEl.muted || videoEl.volume === 0;
}

function volumePercent(): number {
    return isMutedState() ? 0 : Math.round(videoEl.volume * 100);
}

export function updateVolumeUI(): void {
    const muted = isMutedState();
    const pct = volumePercent();
    volumeEl.value = String(muted ? 0 : videoEl.volume);
    volumeEl.style.setProperty("--vol-fill", `${pct}%`);
    setIcon(btnMuteEl, muted ? iconMute() : pct < 50 ? iconVolumeLow() : iconVolume());
    const label = muted ? "Unmute" : "Mute";
    btnMuteEl.setAttribute("aria-label", label);
    btnMuteEl.title = label;
}

export function updateTimeReadout(): void {
    const currentMs = Math.max(0, videoEl.currentTime * 1000);
    const spanMs = Math.max(0, state.selectionEndMs - state.selectionStartMs);
    timeEl.textContent = `${formatClipDuration(currentMs)} / ${formatClipDuration(spanMs)}`;
}

export function flashToggleIcon(): void {
    toggleFlashBubbleEl.classList.remove("ce-toggle-flash-show");
    toggleFlashBubbleEl.replaceChildren(videoEl.paused ? iconPause() : iconPlay());
    void toggleFlashBubbleEl.offsetWidth;
    toggleFlashBubbleEl.classList.add("ce-toggle-flash-show");
}
