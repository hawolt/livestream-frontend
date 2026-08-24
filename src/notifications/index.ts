import { adoptSessionEventsOwner, ingestSessionEvent, onSessionEvent, startSessionEvents, stopSessionEvents } from "./events.ts";
import { loadFirstNotificationsPage } from "./controller.ts";
import { notificationStore } from "./store.ts";
import { parseNotificationFrame } from "./wire.ts";
import { shouldShowToast } from "./toast-policy.ts";
import { ensureToastHost, showToast } from "./toast-host.ts";
import { sessionToken } from "./client.ts";

export { mountNotificationBell } from "./bell.ts";
export type { NotificationBell } from "./bell.ts";
export { clearToasts, ensureToastHost, showToast } from "./toast-host.ts";
export { notificationStore } from "./store.ts";
export { createNotificationStore } from "./store.ts";
export type { NotificationStore } from "./store.ts";
export type { NotificationItem, NotificationState, NotificationType, ToastInput } from "./types.ts";

let started = false;
let unsubscribe: (() => void) | null = null;

function handleFrame(frame: Record<string, unknown>): void {
    if (frame["type"] === "ready") {
        if (notificationStore.getState().loaded) void loadFirstNotificationsPage();
        return;
    }
    const item = parseNotificationFrame(frame);
    if (!item) return;
    const alreadyKnown = !notificationStore.receiveLive(item);
    if (!shouldShowToast({ documentHidden: document.hidden, alreadyKnown, read: item.read })) return;
    showToast({
        type: item.type,
        title: item.title,
        body: item.body,
        linkUrl: item.linkUrl,
        icon: item.icon,
    });
}

export function ingestNotificationFrame(raw: unknown): void {
    ingestSessionEvent(raw);
}

export function useExistingEventsSocket(): void {
    adoptSessionEventsOwner();
}

export function startNotifications(): void {
    if (!sessionToken()) return;
    if (!started) {
        started = true;
        ensureToastHost();
        unsubscribe = onSessionEvent(handleFrame);
        void loadFirstNotificationsPage();
    }
    startSessionEvents();
}

export function stopNotifications(): void {
    started = false;
    unsubscribe?.();
    unsubscribe = null;
    stopSessionEvents();
    notificationStore.reset();
}
