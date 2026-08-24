import { fetchNotifications, markAllNotificationsRead, markNotificationsRead, NOTIFICATION_PAGE_SIZE } from "./client.ts";
import { notificationStore } from "./store.ts";

const LOAD_ERROR = "Could not load notifications.";

let pending = false;

function signedOut(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const status = (error as { status?: number }).status;
    return status === 401 || status === 403;
}

export async function loadFirstNotificationsPage(): Promise<void> {
    if (pending) return;
    pending = true;
    notificationStore.setLoading(true);
    try {
        const page = await fetchNotifications({ limit: NOTIFICATION_PAGE_SIZE });
        notificationStore.receiveFirstPage(
            page.notifications,
            page.unreadCount,
            page.notifications.length < NOTIFICATION_PAGE_SIZE,
        );
    } catch (error) {
        if (signedOut(error)) notificationStore.reset();
        else notificationStore.setError(LOAD_ERROR);
    } finally {
        pending = false;
    }
}

export async function loadMoreNotifications(): Promise<void> {
    const state = notificationStore.getState();
    if (pending || state.exhausted || !state.loaded) return;
    const before = notificationStore.oldestId();
    if (before === null) return;
    pending = true;
    notificationStore.setLoading(true);
    try {
        const page = await fetchNotifications({ before, limit: NOTIFICATION_PAGE_SIZE });
        notificationStore.receiveNextPage(page.notifications, page.notifications.length < NOTIFICATION_PAGE_SIZE);
    } catch (error) {
        if (signedOut(error)) notificationStore.reset();
        else notificationStore.setError(LOAD_ERROR);
    } finally {
        pending = false;
    }
}

export async function markNotificationRead(id: number): Promise<void> {
    const target = notificationStore.getState().items.find(item => item.id === id);
    if (!target || target.read) return;
    notificationStore.markRead([id]);
    try {
        notificationStore.markRead([id], await markNotificationsRead([id], notificationStore.getState().unreadCount));
    } catch {
        await loadFirstNotificationsPage();
    }
}

export async function markAllNotificationsReadNow(): Promise<void> {
    if (notificationStore.getState().unreadCount === 0) return;
    notificationStore.markAllRead();
    try {
        notificationStore.markAllRead(await markAllNotificationsRead());
    } catch {
        await loadFirstNotificationsPage();
    }
}
