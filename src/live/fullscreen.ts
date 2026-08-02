import { btnChatFullscreen, btnFullscreen, chatEl, chatInputEl, chatMessagesEl, stageEl, video } from "./dom.ts";
import { ICON_FULLSCREEN, ICON_FULLSCREEN_EXIT } from "./icons.ts";
import { currentEffectiveLayout, scheduleFullscreenSettle } from "./layout.ts";
import { syncChannelRailVisibility } from "./channel-rail.ts";

export type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };
export type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
export type VideoFs = HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
    webkitDisplayingFullscreen?: boolean;
};

export function videoFs(): VideoFs {
    return video as VideoFs;
}

export function isVideoFullscreen(): boolean {
    const d = document as FullscreenDoc;
    return document.fullscreenElement === stageEl || d.webkitFullscreenElement === stageEl || !!videoFs().webkitDisplayingFullscreen;
}

function enterNativeVideoFullscreen(): void {
    const v = videoFs();
    if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen();
}

export function enterFullscreen(): void {
    const el = stageEl as FullscreenEl;
    if (typeof el.requestFullscreen === "function") {
        void el.requestFullscreen().catch(enterNativeVideoFullscreen);
    } else if (typeof el.webkitRequestFullscreen === "function") {
        el.webkitRequestFullscreen();
    } else {
        enterNativeVideoFullscreen();
    }
}

export function exitFullscreen(): void {
    const d = document as FullscreenDoc;
    const v = videoFs();
    if (v.webkitDisplayingFullscreen && typeof v.webkitExitFullscreen === "function") v.webkitExitFullscreen();
    else if (typeof document.exitFullscreen === "function") void document.exitFullscreen().catch(() => {});
    else if (typeof d.webkitExitFullscreen === "function") d.webkitExitFullscreen();
}

function updateFullscreenIcon(): void {
    const full = isVideoFullscreen();
    btnFullscreen.innerHTML = full ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN;
    const label = full ? "Exit fullscreen" : "Fullscreen";
    btnFullscreen.setAttribute("aria-label", label);
    btnFullscreen.title = label;
}

export function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iP(hone|od|ad)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

export function volumeIsSettable(): boolean {
    const prev = video.volume;
    const probe = prev > 0.5 ? 0.25 : 0.75;
    video.volume = probe;
    const settable = Math.abs(video.volume - probe) < 0.01;
    video.volume = prev;
    return settable;
}

let chatFsActive = false;
let chatFsNative = false;
let chatFsSavedScroll = 0;
let chatFsHadFocus = false;

export function isChatFsActive(): boolean {
    return chatFsActive;
}

export function isChatFsNative(): boolean {
    return chatFsNative;
}

function chatFullscreenTarget(): FullscreenEl {
    return chatEl as FullscreenEl;
}

export function isChatFullscreen(): boolean {
    const d = document as FullscreenDoc;
    return chatFsActive || document.fullscreenElement === chatEl || d.webkitFullscreenElement === chatEl;
}

export function updateChatFullscreenButton(): void {
    const full = isChatFullscreen();
    const label = full ? "Exit fullscreen chat" : "Fullscreen chat";
    btnChatFullscreen.textContent = label;
    btnChatFullscreen.setAttribute("aria-label", label);
    btnChatFullscreen.title = label;
}

function applyChatFullscreenLayout(on: boolean): void {
    chatEl.classList.toggle("chat-fullscreen", on);
    document.body.classList.toggle("chat-fullscreen-lock", on);
    syncChannelRailVisibility();
}

function restoreChatScrollAndFocus(): void {
    const scroll = chatFsSavedScroll;
    const focus = chatFsHadFocus;
    requestAnimationFrame(() => {
        chatMessagesEl.scrollTop = scroll;
        if (focus) chatInputEl.focus();
    });
}

export function enterChatFullscreen(): void {
    if (isChatFullscreen()) return;
    chatFsSavedScroll = chatMessagesEl.scrollTop;
    chatFsHadFocus = document.activeElement === chatInputEl;
    applyChatFullscreenLayout(true);
    chatFsActive = true;
    const el = chatFullscreenTarget();
    if (typeof el.requestFullscreen === "function") {
        chatFsNative = true;
        void el.requestFullscreen().catch(() => {
            chatFsNative = false;
        });
    } else if (typeof el.webkitRequestFullscreen === "function") {
        chatFsNative = true;
        el.webkitRequestFullscreen();
    } else {
        chatFsNative = false;
    }
    updateChatFullscreenButton();
    restoreChatScrollAndFocus();
}

export function exitChatFullscreen(): void {
    if (!isChatFullscreen()) return;
    const d = document as FullscreenDoc;
    if (chatFsNative) {
        if (document.fullscreenElement === chatEl && typeof document.exitFullscreen === "function") void document.exitFullscreen().catch(() => {});
        else if (d.webkitFullscreenElement === chatEl && typeof d.webkitExitFullscreen === "function") d.webkitExitFullscreen();
    }
    chatFsActive = false;
    chatFsNative = false;
    applyChatFullscreenLayout(false);
    updateChatFullscreenButton();
    restoreChatScrollAndFocus();
}

export function toggleChatFullscreen(): void {
    if (isChatFullscreen()) exitChatFullscreen();
    else enterChatFullscreen();
}

function syncChatFullscreenFromDocument(): void {
    const d = document as FullscreenDoc;
    const nativeActive = document.fullscreenElement === chatEl || d.webkitFullscreenElement === chatEl;
    if (!nativeActive && chatFsActive && chatFsNative) {
        chatFsActive = false;
        chatFsNative = false;
        applyChatFullscreenLayout(false);
        restoreChatScrollAndFocus();
    }
}

let preFsLayout: "horizontal" | "vertical" | null = null;

export function onFullscreenChange(): void {
    updateFullscreenIcon();
    const videoFull = isVideoFullscreen();
    if (videoFull) {
        if (preFsLayout === null) preFsLayout = currentEffectiveLayout();
    } else if (preFsLayout !== null) {
        preFsLayout = null;
        scheduleFullscreenSettle();
    }
    syncChatFullscreenFromDocument();
    updateChatFullscreenButton();
    syncChannelRailVisibility();
}
