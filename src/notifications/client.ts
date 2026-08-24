import { apiFetch } from "../api.ts";
import { parseNotificationPage, parseUnreadCount } from "./wire.ts";
import type { NotificationPage } from "./types.ts";

export const NOTIFICATION_PAGE_SIZE = 20;

export function sessionToken(): string {
    try {
        return sessionStorage.getItem("dash_token") ?? "";
    } catch {
        return "";
    }
}

function authInit(init?: RequestInit): RequestInit {
    const token = sessionToken();
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return { ...init, credentials: "include", headers };
}

export async function fetchNotifications(
    options: { before?: number | null; limit?: number } = {},
): Promise<NotificationPage> {
    const params = new URLSearchParams();
    if (typeof options.before === "number" && options.before > 0) params.set("before", String(options.before));
    params.set("limit", String(options.limit ?? NOTIFICATION_PAGE_SIZE));
    return parseNotificationPage(await apiFetch<unknown>(`/api/notifications?${params.toString()}`, authInit()));
}

export async function markNotificationsRead(ids: number[], fallbackUnread: number): Promise<number> {
    if (!ids.length) return fallbackUnread;
    const raw = await apiFetch<unknown>("/api/notifications/read", authInit({
        method: "POST",
        body: JSON.stringify({ ids }),
        keepalive: true,
    }));
    return parseUnreadCount(raw, fallbackUnread);
}

export async function markAllNotificationsRead(): Promise<number> {
    const raw = await apiFetch<unknown>("/api/notifications/read-all", authInit({ method: "POST" }));
    return parseUnreadCount(raw, 0);
}
