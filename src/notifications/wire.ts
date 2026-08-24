import type { NotificationItem, NotificationPage } from "./types.ts";

function asRecord(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
}

function requiredText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value : null;
}

function epochSeconds(value: unknown): number {
    const seconds = typeof value === "number" ? value : Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
}

function notificationId(value: unknown): number | null {
    const id = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return id;
}

export function parseNotificationItem(raw: unknown): NotificationItem | null {
    const record = asRecord(raw);
    if (!record) return null;
    const id = notificationId(record["id"]);
    if (id === null) return null;
    return {
        id,
        type: requiredText(record["type"]) || "system",
        title: requiredText(record["title"]),
        body: optionalText(record["body"]),
        linkUrl: optionalText(record["linkUrl"]),
        icon: optionalText(record["icon"]),
        read: record["read"] === true,
        createdAt: epochSeconds(record["createdAt"]),
    };
}

export function parseNotificationPage(raw: unknown): NotificationPage {
    const record = asRecord(raw);
    const list = record && Array.isArray(record["notifications"]) ? record["notifications"] as unknown[] : [];
    const notifications: NotificationItem[] = [];
    for (const entry of list) {
        const item = parseNotificationItem(entry);
        if (item) notifications.push(item);
    }
    const count = record ? Number(record["unreadCount"]) : NaN;
    return {
        notifications,
        unreadCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    };
}

export function parseUnreadCount(raw: unknown, fallback: number): number {
    const record = asRecord(raw);
    const count = record ? Number(record["unreadCount"]) : NaN;
    if (!Number.isFinite(count) || count < 0) return fallback;
    return Math.floor(count);
}

export function parseNotificationFrame(raw: unknown): NotificationItem | null {
    const record = asRecord(raw);
    if (!record || record["type"] !== "notification") return null;
    const id = notificationId(record["id"]);
    if (id === null) return null;
    return {
        id,
        type: requiredText(record["kind"]) || "system",
        title: requiredText(record["title"]),
        body: optionalText(record["body"]),
        linkUrl: optionalText(record["linkUrl"]),
        icon: optionalText(record["icon"]),
        read: false,
        createdAt: epochSeconds(record["at"]),
    };
}

export function compareNotifications(a: NotificationItem, b: NotificationItem): number {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return b.id - a.id;
}
