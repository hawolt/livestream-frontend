import { describe, expect, test } from "bun:test";
import { createNotificationStore } from "../src/notifications/store.ts";
import type { NotificationItem } from "../src/notifications/types.ts";

function item(id: number, read = false): NotificationItem {
    return {
        id,
        type: "follow",
        title: `notification ${id}`,
        body: null,
        linkUrl: null,
        icon: null,
        read,
        createdAt: 1_700_000_000 + id,
    };
}

describe("notification unread arithmetic", () => {
    test("takes the unread count of the first page from the server", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(3), item(2, true), item(1)], 2, true);
        expect(store.getState().unreadCount).toBe(2);
    });

    test("leaves the unread count alone when an older page arrives", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(9)], 7, false);
        store.receiveNextPage([item(8), item(7)], true);
        expect(store.getState().unreadCount).toBe(7);
    });

    test("adds one for an unread live notification and nothing for a read one", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([], 0, true);
        store.receiveLive(item(1));
        store.receiveLive(item(2));
        expect(store.getState().unreadCount).toBe(2);
        store.receiveLive(item(3, true));
        expect(store.getState().unreadCount).toBe(2);
    });

    test("does not double count a live notification that is already loaded", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(5)], 1, true);
        store.receiveLive(item(5));
        expect(store.getState().unreadCount).toBe(1);
    });

    test("subtracts only the items that were actually unread", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(3), item(2, true), item(1)], 2, true);
        expect(store.markRead([2, 3])).toBe(1);
        expect(store.getState().unreadCount).toBe(1);
    });

    test("marking the same item read twice subtracts once", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(1)], 1, true);
        store.markRead([1]);
        store.markRead([1]);
        expect(store.getState().unreadCount).toBe(0);
    });

    test("never falls below zero", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(2), item(1)], 0, true);
        store.markRead([1, 2]);
        expect(store.getState().unreadCount).toBe(0);
    });

    test("ignores unknown ids", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(1)], 1, true);
        expect(store.markRead([404])).toBe(0);
        expect(store.getState().unreadCount).toBe(1);
    });

    test("prefers the server unread count when one is supplied", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(2), item(1)], 9, true);
        store.markRead([1], 4);
        expect(store.getState().unreadCount).toBe(4);
        store.markRead([2], -3);
        expect(store.getState().unreadCount).toBe(0);
    });

    test("mark all read clears the count and flips every unread item", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(3), item(2, true), item(1)], 5, true);
        expect(store.markAllRead()).toBe(2);
        expect(store.getState().unreadCount).toBe(0);
        expect(store.getState().items.every(entry => entry.read)).toBe(true);
    });

    test("mark all read honours a server count that arrives afterwards", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(1)], 1, true);
        store.markAllRead();
        store.markAllRead(2);
        expect(store.getState().unreadCount).toBe(2);
    });

    test("an unread live notification after mark all read starts the count again", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(1)], 1, true);
        store.markAllRead();
        store.receiveLive(item(2));
        expect(store.getState().unreadCount).toBe(1);
    });
});
