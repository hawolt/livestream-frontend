import { describe, expect, test } from "bun:test";
import {
    compareNotifications,
    parseNotificationFrame,
    parseNotificationItem,
    parseNotificationPage,
    parseUnreadCount,
} from "../src/notifications/wire.ts";

describe("rest notification payload", () => {
    test("reads a full item", () => {
        expect(parseNotificationItem({
            id: 12,
            type: "raid",
            title: "streamer raided you",
            body: "with 40 viewers",
            linkUrl: "/streamer",
            icon: "raid",
            read: false,
            createdAt: 1_700_000_000,
        })).toEqual({
            id: 12,
            type: "raid",
            title: "streamer raided you",
            body: "with 40 viewers",
            linkUrl: "/streamer",
            icon: "raid",
            read: false,
            createdAt: 1_700_000_000,
        });
    });

    test("treats null body, linkUrl and icon as absent", () => {
        const item = parseNotificationItem({ id: 1, type: "system", title: "hi", body: null, linkUrl: null, icon: null, read: true, createdAt: 5 });
        expect(item?.body).toBeNull();
        expect(item?.linkUrl).toBeNull();
        expect(item?.icon).toBeNull();
        expect(item?.read).toBe(true);
    });

    test("falls back to the system type and drops an unusable id", () => {
        expect(parseNotificationItem({ id: 3, title: "x" })?.type).toBe("system");
        expect(parseNotificationItem({ id: 0, title: "x" })).toBeNull();
        expect(parseNotificationItem({ title: "x" })).toBeNull();
        expect(parseNotificationItem(null)).toBeNull();
    });

    test("reads a page and skips unusable entries", () => {
        const page = parseNotificationPage({
            notifications: [{ id: 2, title: "b", createdAt: 2 }, { title: "broken" }, { id: 1, title: "a", createdAt: 1 }],
            unreadCount: 3,
        });
        expect(page.notifications.map(entry => entry.id)).toEqual([2, 1]);
        expect(page.unreadCount).toBe(3);
    });

    test("an unparseable page reads as empty rather than throwing", () => {
        expect(parseNotificationPage(undefined)).toEqual({ notifications: [], unreadCount: 0 });
        expect(parseNotificationPage({ notifications: "nope" }).notifications).toEqual([]);
    });

    test("keeps the previous unread count when a write response omits one", () => {
        expect(parseUnreadCount({ ok: true, updated: 1, unreadCount: 4 }, 9)).toBe(4);
        expect(parseUnreadCount({ ok: true }, 9)).toBe(9);
        expect(parseUnreadCount({ unreadCount: -1 }, 9)).toBe(9);
    });
});

describe("websocket notification frame", () => {
    test("maps kind to type and at to createdAt", () => {
        expect(parseNotificationFrame({
            type: "notification",
            id: 77,
            kind: "badge",
            title: "New badge",
            body: null,
            linkUrl: "/dashboard",
            icon: null,
            at: 1_700_000_500,
        })).toEqual({
            id: 77,
            type: "badge",
            title: "New badge",
            body: null,
            linkUrl: "/dashboard",
            icon: null,
            read: false,
            createdAt: 1_700_000_500,
        });
    });

    test("ignores every frame that is not a notification", () => {
        expect(parseNotificationFrame({ type: "viewcount", viewers: 4 })).toBeNull();
        expect(parseNotificationFrame({ type: "ready" })).toBeNull();
        expect(parseNotificationFrame({ id: 1, kind: "live" })).toBeNull();
    });

    test("a live frame is always unread", () => {
        expect(parseNotificationFrame({ type: "notification", id: 1, kind: "live", title: "x", read: true })?.read).toBe(false);
    });
});

describe("notification ordering", () => {
    test("newest createdAt first, then highest id", () => {
        const base = { type: "system", title: "", body: null, linkUrl: null, icon: null, read: false };
        const older = { ...base, id: 9, createdAt: 100 };
        const newer = { ...base, id: 1, createdAt: 200 };
        const tie = { ...base, id: 10, createdAt: 100 };
        expect([older, newer, tie].sort(compareNotifications).map(entry => entry.id)).toEqual([1, 10, 9]);
    });
});
