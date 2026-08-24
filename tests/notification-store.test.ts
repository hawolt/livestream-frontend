import { describe, expect, test } from "bun:test";
import { createNotificationStore } from "../src/notifications/store.ts";
import type { NotificationItem, NotificationState } from "../src/notifications/types.ts";

function item(id: number, overrides: Partial<NotificationItem> = {}): NotificationItem {
    return {
        id,
        type: "follow",
        title: `notification ${id}`,
        body: null,
        linkUrl: null,
        icon: null,
        read: false,
        createdAt: 1_700_000_000 + id,
        ...overrides,
    };
}

describe("notification store", () => {
    test("delivers the current state to a new subscriber and on every change", () => {
        const store = createNotificationStore();
        const seen: NotificationState[] = [];
        store.subscribe(state => seen.push(state));

        expect(seen).toHaveLength(1);
        expect(seen[0]!.items).toEqual([]);

        store.receiveFirstPage([item(2), item(1)], 2, true);

        expect(seen).toHaveLength(2);
        expect(seen[1]!.items.map(entry => entry.id)).toEqual([2, 1]);
    });

    test("stops notifying an unsubscribed listener", () => {
        const store = createNotificationStore();
        let calls = 0;
        const unsubscribe = store.subscribe(() => { calls += 1; });
        unsubscribe();
        store.receiveFirstPage([item(1)], 1, true);
        expect(calls).toBe(1);
    });

    test("keeps items newest first across pages", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(9), item(8)], 0, false);
        store.receiveNextPage([item(7), item(6)], true);
        expect(store.getState().items.map(entry => entry.id)).toEqual([9, 8, 7, 6]);
        expect(store.getState().exhausted).toBe(true);
    });

    test("breaks a createdAt tie by descending id", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([
            item(4, { createdAt: 100 }),
            item(7, { createdAt: 100 }),
        ], 0, true);
        expect(store.getState().items.map(entry => entry.id)).toEqual([7, 4]);
    });

    test("reports the oldest loaded id as the paging cursor", () => {
        const store = createNotificationStore();
        expect(store.oldestId()).toBeNull();
        store.receiveFirstPage([item(9), item(8), item(5)], 0, false);
        expect(store.oldestId()).toBe(5);
    });

    test("ignores a live notification whose id is already loaded", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(3)], 1, true);
        expect(store.receiveLive(item(3))).toBe(false);
        expect(store.getState().items).toHaveLength(1);
    });

    test("inserts a live notification in sort order", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(9, { createdAt: 900 }), item(4, { createdAt: 400 })], 0, true);
        store.receiveLive(item(6, { createdAt: 600 }));
        expect(store.getState().items.map(entry => entry.id)).toEqual([9, 6, 4]);
    });

    test("drops duplicate ids when a page overlaps what is already loaded", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(9), item(8)], 0, false);
        store.receiveNextPage([item(8), item(7)], true);
        expect(store.getState().items.map(entry => entry.id)).toEqual([9, 8, 7]);
    });

    test("clears the error and marks itself loaded once a page arrives", () => {
        const store = createNotificationStore();
        store.setError("Could not load notifications.");
        expect(store.getState().error).toBe("Could not load notifications.");
        store.receiveFirstPage([], 0, true);
        expect(store.getState().error).toBe("");
        expect(store.getState().loaded).toBe(true);
    });

    test("reset returns the store to its empty state", () => {
        const store = createNotificationStore();
        store.receiveFirstPage([item(1)], 1, true);
        store.reset();
        const state = store.getState();
        expect(state.items).toEqual([]);
        expect(state.unreadCount).toBe(0);
        expect(state.loaded).toBe(false);
    });
});
