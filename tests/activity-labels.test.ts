import { describe, expect, test } from "bun:test";
import { eventTextLabel, eventTypeLabel, isStreamEvent, type FollowEvent } from "../src/dash/activity-events.ts";

describe("eventTypeLabel", () => {
    test("stream events collapse to STREAM", () => {
        expect(eventTypeLabel("reject")).toBe("STREAM");
        expect(eventTypeLabel("warn")).toBe("STREAM");
    });

    test("points.redeem shows REDEEM", () => {
        expect(eventTypeLabel("points.redeem")).toBe("REDEEM");
    });

    test("other types uppercase their own name", () => {
        expect(eventTypeLabel("follow")).toBe("FOLLOW");
        expect(eventTypeLabel("subscription")).toBe("SUBSCRIPTION");
    });
});

describe("eventTextLabel", () => {
    test("a raid names the viewer count with correct pluralisation", () => {
        expect(eventTextLabel({ type: "raid", username: "alice", at: 1, viewers: 1 })).toBe("alice with 1 viewer");
        expect(eventTextLabel({ type: "raid", username: "alice", at: 1, viewers: 3 })).toBe("alice with 3 viewers");
    });

    test("a redeem names the reward, falling back when absent", () => {
        expect(eventTextLabel({ type: "points.redeem", username: "bob", at: 1, detail: "Hydrate" })).toBe("bob redeemed Hydrate");
        expect(eventTextLabel({ type: "points.redeem", username: "bob", at: 1 })).toBe("bob redeemed a reward");
    });

    test("a plain follow is just the username", () => {
        expect(eventTextLabel({ type: "follow", username: "carol", at: 1 })).toBe("carol");
    });

    test("a stream reject uses the reject label", () => {
        const e: FollowEvent = { type: "reject", username: "-", at: 1, detail: "bitrate too high" };
        expect(eventTextLabel(e)).toBe("bitrate too high");
    });
});

describe("isStreamEvent", () => {
    test("only reject and warn are stream events", () => {
        expect(isStreamEvent("reject")).toBe(true);
        expect(isStreamEvent("warn")).toBe(true);
        expect(isStreamEvent("follow")).toBe(false);
    });
});
