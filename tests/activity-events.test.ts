import { describe, expect, test } from "bun:test";
import { countNewFollowerEvents, countNewLiveEvents, mergeFollowEvents, viewerCountLabel, type FollowEvent } from "../src/dash/activity-events.ts";

const event = (username: string, at: number): FollowEvent => ({ type: "follow", username, at });
const raid = (username: string, at: number): FollowEvent => ({ type: "raid", username, at });

describe("activity event reconciliation", () => {
    test("retains live events that arrive before the snapshot", () => {
        expect(mergeFollowEvents([event("alice", 10)], [event("bob", 20)], 50))
            .toEqual([event("bob", 20), event("alice", 10)]);
    });

    test("deduplicates matching snapshot and live events case-insensitively", () => {
        expect(mergeFollowEvents([event("Alice", 10)], [event("alice", 10)], 50))
            .toEqual([event("alice", 10)]);
        expect(countNewLiveEvents([event("Alice", 10)], [event("alice", 10)])).toBe(0);
    });

    test("counts only distinct live events absent from the snapshot", () => {
        const live = [event("bob", 20), event("bob", 20), event("carol", 30)];
        expect(countNewLiveEvents([event("alice", 10)], live)).toBe(2);
    });

    test("sorts newest first and caps the result", () => {
        expect(mergeFollowEvents([event("alice", 10)], [event("bob", 30), event("carol", 20)], 2))
            .toEqual([event("bob", 30), event("carol", 20)]);
    });
});

describe("countNewFollowerEvents", () => {
    test("counts a new follow that arrived before the snapshot", () => {
        expect(countNewFollowerEvents([event("alice", 10)], [event("bob", 20)])).toBe(1);
    });

    test("ignores a raid that arrived before the snapshot", () => {
        expect(countNewFollowerEvents([event("alice", 10)], [raid("bob", 20)])).toBe(0);
    });

    test("counts only the follow out of a mixed batch of live events", () => {
        const live = [event("bob", 20), raid("carol", 25)];
        expect(countNewFollowerEvents([event("alice", 10)], live)).toBe(1);
    });

    test("does not double count a follow already present in the snapshot", () => {
        expect(countNewFollowerEvents([event("bob", 20)], [event("bob", 20)])).toBe(0);
    });
});

describe("viewerCountLabel", () => {
    test("renders dash when the count is unknown", () => {
        expect(viewerCountLabel(null, null)).toBe("-");
        expect(viewerCountLabel(null, true)).toBe("-");
    });

    test("renders the number for zero viewers while live", () => {
        expect(viewerCountLabel(0, true)).toBe("0");
    });

    test("renders offline whenever live is explicitly false", () => {
        expect(viewerCountLabel(0, false)).toBe("Offline");
        expect(viewerCountLabel(5, false)).toBe("Offline");
    });

    test("falls back to offline for zero viewers with no live flag", () => {
        expect(viewerCountLabel(0, null)).toBe("Offline");
    });

    test("renders positive counts regardless of the live flag", () => {
        expect(viewerCountLabel(7, true)).toBe("7");
        expect(viewerCountLabel(7, null)).toBe("7");
    });
});
