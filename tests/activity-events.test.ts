import { describe, expect, test } from "bun:test";
import { countNewLiveEvents, mergeFollowEvents, type FollowEvent } from "../src/dash/activity-events.ts";

const event = (username: string, at: number): FollowEvent => ({ type: "follow", username, at });

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
