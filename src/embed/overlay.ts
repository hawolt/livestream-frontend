import { unmuteBtn, video } from "./dom.ts";
import { cleanfeedMode, controlsMode, previewMode } from "./context.ts";

const overlayEl = document.getElementById("embed-overlay") as HTMLElement;
const channelLink = document.getElementById("embed-channel") as HTMLAnchorElement;
const channelNameEl = document.getElementById("embed-channel-name") as HTMLElement;
const channelTitleEl = document.getElementById("embed-channel-title") as HTMLElement;
const playBtn = document.getElementById("embed-play") as HTMLButtonElement;
const muteBtn = document.getElementById("embed-mute") as HTMLButtonElement;
const volumeEl = document.getElementById("embed-volume") as HTMLInputElement;

const PLAY_ICON = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
const VOLUME_ICON = `<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const MUTED_ICON = `<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

const TOUCH_HIDE_MS = 3000;

let userPaused = false;
let audioInteracted = false;
let touchTimer: number | null = null;

function markAudioInteraction(): void {
    audioInteracted = true;
    unmuteBtn.classList.add("hidden");
}

export function hasAudioInteraction(): boolean {
    return audioInteracted;
}

export function overlayContains(node: Node | null): boolean {
    return node !== null && overlayEl.contains(node);
}

export function setOverlayChannel(username: string, display: string, title: string): void {
    channelLink.href = `/${encodeURIComponent(username)}`;
    channelNameEl.textContent = display || username;
    channelTitleEl.textContent = title;
    channelTitleEl.hidden = title === "";
}

export function setOverlayOffline(offline: boolean): void {
    document.body.classList.toggle("embed-offline", offline);
}

function syncPlayIcon(): void {
    playBtn.innerHTML = video.paused ? PLAY_ICON : PAUSE_ICON;
    playBtn.setAttribute("aria-label", video.paused ? "Play" : "Pause");
}

function syncVolumeUI(): void {
    const silent = video.muted || video.volume === 0;
    muteBtn.innerHTML = silent ? MUTED_ICON : VOLUME_ICON;
    muteBtn.setAttribute("aria-label", silent ? "Unmute" : "Mute");
    volumeEl.value = String(silent ? 0 : Math.round(video.volume * 100));
}

function setUserPaused(paused: boolean): void {
    userPaused = paused;
    document.body.classList.toggle("embed-user-paused", paused);
}

export function wireOverlay(): void {
    if (previewMode || cleanfeedMode || controlsMode) {
        overlayEl.remove();
        return;
    }
    syncPlayIcon();
    syncVolumeUI();

    playBtn.addEventListener("click", () => {
        if (video.paused) {
            setUserPaused(false);
            void video.play().catch(() => {});
        } else {
            setUserPaused(true);
            video.pause();
        }
    });
    video.addEventListener("play", () => {
        setUserPaused(false);
        syncPlayIcon();
    });
    video.addEventListener("pause", syncPlayIcon);

    muteBtn.addEventListener("click", () => {
        markAudioInteraction();
        if (video.muted || video.volume === 0) {
            video.muted = false;
            if (video.volume === 0) video.volume = 1;
        } else {
            video.muted = true;
        }
    });
    volumeEl.addEventListener("input", () => {
        markAudioInteraction();
        const v = Number(volumeEl.value) / 100;
        video.volume = v;
        video.muted = v === 0;
    });
    video.addEventListener("volumechange", syncVolumeUI);

    window.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType !== "touch") return;
        overlayEl.classList.add("embed-overlay-visible");
        if (touchTimer !== null) window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => {
            touchTimer = null;
            overlayEl.classList.remove("embed-overlay-visible");
        }, TOUCH_HIDE_MS);
    });
}

export function isUserPaused(): boolean {
    return userPaused;
}
