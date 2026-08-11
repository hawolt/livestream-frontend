import { describe, expect, test } from "bun:test";
import { slotHasOwnSound, soundSlotEndpoints } from "../src/dash/alert-sound-slots.ts";

describe("soundSlotEndpoints", () => {
    test("builds the three slots in order default, follow, raid", () => {
        const endpoints = soundSlotEndpoints("hawolt");
        expect(endpoints.map(e => e.slot)).toEqual(["default", "follow", "raid"]);

        expect(endpoints[0]!.upload).toBe("/api/profile/me/alert-sound");
        expect(endpoints[0]!.remove).toBe("/api/profile/me/alert-sound");
        expect(endpoints[0]!.head).toBe("/api/live/alert-sound/hawolt");

        expect(endpoints[1]!.upload).toBe("/api/profile/me/alert-sound/follow");
        expect(endpoints[1]!.remove).toBe("/api/profile/me/alert-sound/follow");
        expect(endpoints[1]!.head).toBe("/api/live/alert-sound/hawolt/follow");

        expect(endpoints[2]!.upload).toBe("/api/profile/me/alert-sound/raid");
        expect(endpoints[2]!.remove).toBe("/api/profile/me/alert-sound/raid");
        expect(endpoints[2]!.head).toBe("/api/live/alert-sound/hawolt/raid");
    });

    test("encodes the username in the public head urls", () => {
        const endpoints = soundSlotEndpoints("some-user");
        expect(endpoints[0]!.head).toBe("/api/live/alert-sound/some-user");
        expect(endpoints[1]!.head).toBe("/api/live/alert-sound/some-user/follow");
    });
});

describe("slotHasOwnSound", () => {
    test("default slot is ok-driven", () => {
        expect(slotHasOwnSound("default", true, null)).toBe(true);
        expect(slotHasOwnSound("default", false, "type")).toBe(false);
    });

    test("typed slot requires source header type", () => {
        expect(slotHasOwnSound("follow", true, "default")).toBe(false);
        expect(slotHasOwnSound("follow", true, "type")).toBe(true);
        expect(slotHasOwnSound("raid", true, null)).toBe(false);
    });
});
