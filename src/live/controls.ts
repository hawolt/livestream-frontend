import {
    btnChatCollapse,
    btnChatFullscreen,
    btnChatMore,
    btnChatPopout,
    btnChatSide,
    btnChatToggle,
    btnCinema,
    btnClip,
    btnFullscreen,
    btnLayoutToggle,
    btnMute,
    btnPlay,
    chatOverflow,
    stageEl,
    video,
    volInput,
    volpctEl,
} from "./dom.ts";
import { ctx } from "./player/context.ts";
import { readLocalStorage, writeLocalStorage } from "../storage.ts";
import {
    CHAT_COLLAPSE_KEY,
    CHAT_SIDE_KEY,
    COMPACT_MAX_WIDTH_PX,
    CONTROLS_HIDE_MS,
    HEALTH_STALE_MS,
    START_BEHIND_S,
    VOLUME_KEY,
} from "./constants.ts";
import { ICON_CINEMA, ICON_CLIP, ICON_FULLSCREEN, ICON_MUTE, ICON_PAUSE, ICON_PLAY, ICON_VOLUME, ICON_VOLUME_LOW } from "./icons.ts";
import { wireClipButton } from "./clip/button.ts";
import { bufferedEnd } from "./player/mse.ts";
import { healthRestart } from "./player/health.ts";
import { cycleLayout, fitChat, setChatCollapsed, syncLayout, toggleChat, wireLayoutQuery } from "./layout.ts";
import {
    enterFullscreen,
    exitChatFullscreen,
    exitFullscreen,
    isChatFsNative,
    isChatFullscreen,
    isIOS,
    isVideoFullscreen,
    onFullscreenChange,
    toggleChatFullscreen,
    updateChatFullscreenButton,
    volumeIsSettable,
} from "./fullscreen.ts";
import { isCinemaMode, exitCinemaMode, toggleCinemaMode } from "./cinema.ts";
import { isBrowseMode, wireBrowseMode } from "./browse-mini.ts";
import { wirePageLifecycle } from "./player/lifecycle.ts";
import { renderQualityMenu, wireQualityMenu } from "./quality-menu.ts";
import { startFpsMeter, updateQuality } from "./stream-info.ts";
import { wireSeekBar } from "./seekbar.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";

function setChatOverflow(open: boolean, restoreFocus = false): void {
    chatOverflow.hidden = !open;
    btnChatMore.classList.toggle("active", open);
    btnChatMore.setAttribute("aria-expanded", String(open));
    if (open) {
        openDismissibleSurface(chatOverflow, () => setChatOverflow(false, true));
    } else {
        closeDismissibleSurface(chatOverflow);
        if (restoreFocus && btnChatMore.isConnected) btnChatMore.focus();
    }
}

let chatOverflowWired = false;

export function wireChatOverflow(): void {
    if (chatOverflowWired) return;
    chatOverflowWired = true;
    btnChatMore.removeAttribute("aria-haspopup");
    btnChatMore.setAttribute("aria-expanded", "false");
    btnChatMore.setAttribute("aria-controls", chatOverflow.id);
    btnChatMore.addEventListener("click", () => setChatOverflow(chatOverflow.hidden));
    chatOverflow.addEventListener("click", () => {
        const restoreFocus = document.activeElement instanceof Node && chatOverflow.contains(document.activeElement);
        setChatOverflow(false, restoreFocus);
    });
    document.addEventListener("click", (ev) => {
        const target = ev.target as Node;
        if (!chatOverflow.hidden && !chatOverflow.contains(target) && !btnChatMore.contains(target)) setChatOverflow(false);
    });
}

function updatePlayIcon(): void {
    btnPlay.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
    const label = video.paused ? "Play" : "Pause";
    btnPlay.setAttribute("aria-label", label);
    btnPlay.title = label;
}

function isMutedState(): boolean {
    return video.muted || video.volume === 0;
}

function volumePercent(): number {
    return isMutedState() ? 0 : Math.round(video.volume * 100);
}

function updateVolumeUI(): void {
    const muted = isMutedState();
    const pct = volumePercent();
    volInput.value = String(muted ? 0 : video.volume);
    volInput.style.setProperty("--vol-fill", `${pct}%`);
    volpctEl.textContent = muted ? "Muted" : `${pct}%`;
    btnMute.innerHTML = muted ? ICON_MUTE : pct < 50 ? ICON_VOLUME_LOW : ICON_VOLUME;
    const label = muted ? "Unmute" : "Mute";
    btnMute.setAttribute("aria-label", label);
    btnMute.title = label;
}

let pendingPauseTap = true;

function toggleClickPause(): void {
    if (ctx.terminal || ctx.state !== "playing" || isBrowseMode()) return;
    if (video.paused) {
        void video.play().catch(() => {});
    } else {
        video.pause();
    }
}

function wireVideoClickToPause(): void {
    video.addEventListener("pointerdown", (ev) => {
        pendingPauseTap = ev.pointerType === "mouse" ? true : stageEl.classList.contains("controls-visible");
    });
    video.addEventListener("click", (ev) => {
        if (ev.target !== video) return;
        if (!pendingPauseTap) return;
        toggleClickPause();
    });
}

let controlsHideTimer: number | null = null;

export function wireControls(): void {
    wireChatOverflow();
    if (isIOS() || !volumeIsSettable()) {
        volInput.hidden = true;
        volpctEl.hidden = true;
    }

    wireLayoutQuery();
    window.addEventListener("resize", syncLayout);
    window.addEventListener("orientationchange", syncLayout);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncLayout);
    }
    if (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.addEventListener === "function") {
        screen.orientation.addEventListener("change", syncLayout);
    }
    video.addEventListener("loadedmetadata", fitChat);
    new ResizeObserver(fitChat).observe(stageEl);

    updatePlayIcon();
    updateVolumeUI();
    btnFullscreen.innerHTML = ICON_FULLSCREEN;
    btnFullscreen.setAttribute("aria-label", "Fullscreen");
    btnFullscreen.title = "Fullscreen";
    updateChatFullscreenButton();
    btnCinema.innerHTML = ICON_CINEMA;
    btnCinema.setAttribute("aria-label", "Cinema mode");
    btnCinema.title = "Cinema mode";
    btnClip.innerHTML = ICON_CLIP;
    btnClip.setAttribute("aria-label", "Clip");
    btnClip.title = "Clip";
    wireClipButton();
    wireSeekBar();
    wireVideoClickToPause();
    wireQualityMenu();
    renderQualityMenu();

    btnPlay.addEventListener("click", () => {
        if (video.paused) {
            void video.play().catch(() => {});
        } else {
            video.pause();
        }
    });

    video.addEventListener("play", () => {
        updatePlayIcon();
        if (ctx.transportKind === "ws" && ctx.lastMediaArrivalAt > 0 && Date.now() - ctx.lastMediaArrivalAt > HEALTH_STALE_MS) {
            healthRestart("resume-stale");
            return;
        }
        if (ctx.transportKind === "ws" && ctx.behindLive) return;
        const edge = bufferedEnd();
        if (edge > 0) {
            video.currentTime = Math.max(0, edge - START_BEHIND_S);
        }
    });
    video.addEventListener("pause", () => {
        updatePlayIcon();
    });
    video.addEventListener("resize", updateQuality);
    video.addEventListener("loadedmetadata", updateQuality);
    startFpsMeter();
    video.addEventListener("timeupdate", () => {
        if (Math.abs(video.currentTime - ctx.lastObservedTime) > 0.01) {
            ctx.lastObservedTime = video.currentTime;
            ctx.lastProgressAt = Date.now();
        }
    });

    btnMute.addEventListener("click", () => {
        if (isMutedState()) {
            video.muted = false;
            if (video.volume === 0) video.volume = 0.5;
            void video.play().catch(() => {});
        } else {
            video.muted = true;
        }
        updateVolumeUI();
    });

    volInput.addEventListener("input", () => {
        const v = parseFloat(volInput.value);
        video.volume = v;
        video.muted = v === 0;
        updateVolumeUI();
        writeLocalStorage(VOLUME_KEY, String(v));
    });

    btnFullscreen.addEventListener("click", () => {
        if (isVideoFullscreen()) exitFullscreen();
        else enterFullscreen();
    });
    btnCinema.addEventListener("click", toggleCinemaMode);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    video.addEventListener("webkitbeginfullscreen", onFullscreenChange);
    video.addEventListener("webkitendfullscreen", onFullscreenChange);

    stageEl.addEventListener("mouseenter", () => stageEl.classList.add("controls-visible"));
    stageEl.addEventListener("mouseleave", () => stageEl.classList.remove("controls-visible"));
    stageEl.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType === "mouse") return;
        stageEl.classList.add("controls-visible");
        if (controlsHideTimer !== null) window.clearTimeout(controlsHideTimer);
        controlsHideTimer = window.setTimeout(() => {
            stageEl.classList.remove("controls-visible");
            controlsHideTimer = null;
        }, CONTROLS_HIDE_MS);
        const target = ev.target as HTMLElement | null;
        if (video.muted && !(target && target.closest(".live-controls"))) {
            video.muted = false;
            void video.play().catch(() => {});
            updateVolumeUI();
        }
    });

    document.addEventListener("keydown", (ev) => {
        const target = ev.target as HTMLElement | null;
        const interactive = target?.closest(
            "a[href], button, input, select, textarea, [contenteditable]:not([contenteditable=false]), [role=button], [role=link], [role=slider], [role=textbox], [role=menuitem]",
        );
        if (ev.defaultPrevented || ev.repeat) return;
        if (ev.key === "Escape") {
            if (isChatFullscreen() && !isChatFsNative()) {
                ev.preventDefault();
                exitChatFullscreen();
            } else if (isCinemaMode() && !isChatFullscreen() && !isVideoFullscreen()) {
                ev.preventDefault();
                exitCinemaMode();
            }
            return;
        }
        if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || interactive) return;
        if (ev.key === " ") {
            ev.preventDefault();
            btnPlay.click();
        } else if (ev.key === "m" || ev.key === "M") {
            btnMute.click();
        } else if (ev.key === "f" || ev.key === "F") {
            btnFullscreen.click();
        }
    });

    btnLayoutToggle.addEventListener("click", cycleLayout);
    btnChatToggle.addEventListener("click", toggleChat);
    btnChatCollapse.addEventListener("click", toggleChat);
    btnChatFullscreen.addEventListener("click", toggleChatFullscreen);
    btnChatSide.addEventListener("click", () => {
        const left = !document.body.classList.contains("chat-left");
        document.body.classList.toggle("chat-left", left);
        writeLocalStorage(CHAT_SIDE_KEY, left ? "left" : "right");
    });
    btnChatPopout.addEventListener("click", () => {
        const url = `/${encodeURIComponent(ctx.username)}?chat=popout`;
        window.open(url, `chat_${ctx.username}`, "width=420,height=760,menubar=no,toolbar=no,location=no");
    });
    if (readLocalStorage(CHAT_SIDE_KEY) === "left") document.body.classList.add("chat-left");
    const storedChat = readLocalStorage(CHAT_COLLAPSE_KEY);
    setChatCollapsed(window.innerWidth <= COMPACT_MAX_WIDTH_PX ? false : storedChat === "1");

    const storedVol = readLocalStorage(VOLUME_KEY);
    if (storedVol !== null) {
        const v = parseFloat(storedVol);
        if (!Number.isNaN(v) && v >= 0 && v <= 1) {
            video.volume = v;
            updateVolumeUI();
        }
    }

    wireBrowseMode();
    wirePageLifecycle();
}
