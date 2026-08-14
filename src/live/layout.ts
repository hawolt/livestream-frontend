import { btnCinema, btnLayoutToggle, chatEl, chatHeadActionsEl, chatHeadEl, page, viewersEl } from "./dom.ts";
import { syncChannelRailVisibility } from "./channel-rail.ts";
import { readLocalStorage, writeLocalStorage } from "../storage.ts";
import {
    CHAT_COLLAPSE_KEY,
    FULLSCREEN_SETTLE_MS,
    LAYOUT_KEY,
    LAYOUT_VERTICAL_QUERY,
} from "./constants.ts";
import { healthCheck } from "./player/health.ts";
import { exitCinemaMode, isCinemaMode } from "./cinema.ts";

export type LiveLayoutMode = "auto" | "horizontal" | "vertical";

const layoutQuery = window.matchMedia(LAYOUT_VERTICAL_QUERY);

export function isPopoutMode(): boolean {
    return document.body.classList.contains("chat-popout");
}

export function getLayoutMode(): LiveLayoutMode {
    const stored = readLocalStorage(LAYOUT_KEY);
    return stored === "horizontal" || stored === "vertical" ? stored : "auto";
}

function layoutLabel(mode: LiveLayoutMode): string {
    return `Layout: ${mode}`;
}

export function currentEffectiveLayout(): "horizontal" | "vertical" {
    return page.classList.contains("is-vertical") ? "vertical" : "horizontal";
}

export function wireLayoutQuery(): void {
    layoutQuery.addEventListener("change", syncLayout);
}

export function syncLayout(): void {
    if (isPopoutMode()) return;
    const mode = getLayoutMode();
    const effective = mode === "auto" ? (layoutQuery.matches ? "vertical" : "horizontal") : mode;
    const isVertical = effective === "vertical";
    page.classList.toggle("is-vertical", isVertical);
    document.body.classList.toggle("is-vertical", isVertical);
    if (isVertical) document.body.classList.remove("chat-collapsed");
    if (isVertical) {
        viewersEl.after(chatHeadActionsEl);
    } else if (chatHeadActionsEl.parentElement !== chatHeadEl) {
        chatHeadEl.appendChild(chatHeadActionsEl);
    }
    const label = layoutLabel(mode);
    btnLayoutToggle.title = label;
    btnLayoutToggle.setAttribute("aria-label", label);
    fitChat();
    updateCinemaButtonVisibility();
    syncChannelRailVisibility();
}

let settleRaf1: number | null = null;
let settleRaf2: number | null = null;
let settleTimer: number | null = null;

export function cancelFullscreenSettle(): void {
    if (settleRaf1 !== null) {
        cancelAnimationFrame(settleRaf1);
        settleRaf1 = null;
    }
    if (settleRaf2 !== null) {
        cancelAnimationFrame(settleRaf2);
        settleRaf2 = null;
    }
    if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
    }
}

export function scheduleFullscreenSettle(): void {
    cancelFullscreenSettle();
    settleRaf1 = requestAnimationFrame(() => {
        settleRaf1 = null;
        settleRaf2 = requestAnimationFrame(() => {
            settleRaf2 = null;
            settleTimer = window.setTimeout(() => {
                settleTimer = null;
                syncLayout();
                healthCheck();
            }, FULLSCREEN_SETTLE_MS);
        });
    });
}

export function cycleLayout(): void {
    const order: LiveLayoutMode[] = ["auto", "horizontal", "vertical"];
    const next = order[(order.indexOf(getLayoutMode()) + 1) % order.length];
    writeLocalStorage(LAYOUT_KEY, next);
    syncLayout();
}

export function updateCinemaButtonVisibility(): void {
    const unavailable = isPopoutMode() || currentEffectiveLayout() === "vertical";
    btnCinema.hidden = unavailable;
    if (unavailable && isCinemaMode()) exitCinemaMode();
}

export function setChatCollapsed(collapsed: boolean): void {
    if (isPopoutMode()) {
        document.body.classList.remove("chat-collapsed");
        fitChat();
        return;
    }
    document.body.classList.toggle("chat-collapsed", collapsed);
    writeLocalStorage(CHAT_COLLAPSE_KEY, collapsed ? "1" : "0");
    fitChat();
}

export function toggleChat(): void {
    setChatCollapsed(!document.body.classList.contains("chat-collapsed"));
}

export function fitChat(): void {
    chatEl.style.width = "";
}
