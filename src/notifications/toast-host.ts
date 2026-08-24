import { ensureNotificationStyles } from "./styles.ts";
import { CLOSE_ICON, notificationIcon } from "./icons.ts";
import { safeNotificationHref } from "./link.ts";
import {
    admitToast,
    dismissToast,
    holdToastTimer,
    releaseToastTimer,
    startToastTimer,
    toastTimerExpired,
    TOAST_DISMISS_MS,
    type ToastTimer,
} from "./toast-queue.ts";
import type { ToastInput } from "./types.ts";

const TICK_MS = 250;
const LEAVE_MS = 180;

interface LiveToast {
    element: HTMLElement;
    timer: ToastTimer;
}

let host: HTMLElement | null = null;
let visible: LiveToast[] = [];
let ticker: number | null = null;

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toastHost(): HTMLElement {
    if (host?.isConnected) return host;
    ensureNotificationStyles();
    const element = document.createElement("div");
    element.className = "site-toasts";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    element.setAttribute("aria-atomic", "false");
    document.body.appendChild(element);
    host = element;
    return element;
}

export function ensureToastHost(): void {
    toastHost();
}

function removeToast(entry: LiveToast): void {
    if (!visible.includes(entry)) return;
    visible = dismissToast(visible, entry);
    syncTicker();
    if (prefersReducedMotion()) {
        entry.element.remove();
        return;
    }
    entry.element.classList.add("leaving");
    window.setTimeout(() => entry.element.remove(), LEAVE_MS);
}

function tick(): void {
    const now = Date.now();
    for (const entry of [...visible]) {
        if (toastTimerExpired(entry.timer, now)) removeToast(entry);
    }
}

function syncTicker(): void {
    if (visible.length === 0) {
        if (ticker !== null) {
            window.clearInterval(ticker);
            ticker = null;
        }
        return;
    }
    if (ticker === null) ticker = window.setInterval(tick, TICK_MS);
}

function buildToastElement(input: ToastInput, dismiss: () => void): HTMLElement {
    const element = document.createElement("div");
    element.className = "site-toast";

    const href = safeNotificationHref(input.linkUrl);
    const link = document.createElement(href ? "a" : "button") as HTMLElement;
    link.className = "site-toast-link";
    if (href) {
        (link as HTMLAnchorElement).href = href;
    } else {
        (link as HTMLButtonElement).type = "button";
    }

    const icon = document.createElement("span");
    icon.className = "site-toast-icon";
    icon.innerHTML = notificationIcon(input.icon ?? input.type ?? "system");

    const text = document.createElement("span");
    text.className = "site-toast-text";
    const title = document.createElement("span");
    title.className = "site-toast-title";
    title.textContent = input.title;
    text.appendChild(title);
    if (input.body) {
        const body = document.createElement("span");
        body.className = "site-toast-body";
        body.textContent = input.body;
        text.appendChild(body);
    }
    link.append(icon, text);
    link.addEventListener("click", () => dismiss());

    const close = document.createElement("button");
    close.type = "button";
    close.className = "site-toast-close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.innerHTML = CLOSE_ICON;
    close.addEventListener("click", () => dismiss());

    element.append(link, close);
    return element;
}

export function showToast(input: ToastInput, durationMs: number = TOAST_DISMISS_MS): () => void {
    const container = toastHost();
    let entry: LiveToast | null = null;
    const dismiss = (): void => {
        if (entry) removeToast(entry);
    };
    const element = buildToastElement(input, dismiss);
    entry = { element, timer: startToastTimer(Date.now(), durationMs) };
    const live = entry;

    const hold = (): void => {
        live.timer = holdToastTimer(live.timer, Date.now());
    };
    const release = (): void => {
        live.timer = releaseToastTimer(live.timer, Date.now());
    };
    element.addEventListener("mouseenter", hold);
    element.addEventListener("mouseleave", release);
    element.addEventListener("focusin", hold);
    element.addEventListener("focusout", release);

    const admission = admitToast(visible, live);
    for (const evicted of admission.evicted) evicted.element.remove();
    visible = admission.visible;
    container.appendChild(element);
    syncTicker();
    return dismiss;
}

export function clearToasts(): void {
    for (const entry of [...visible]) {
        entry.element.remove();
    }
    visible = [];
    syncTicker();
}
