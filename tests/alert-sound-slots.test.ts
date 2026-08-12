import { describe, expect, test } from "bun:test";
import { SOUND_SLOTS, soundSlotEndpoints } from "../src/dash/alert-sound-slots.ts";

describe("soundSlotEndpoints", () => {
    test("builds the three slots in order default, follow, raid", () => {
        const endpoints = soundSlotEndpoints();
        expect(endpoints.map(e => e.slot)).toEqual(["default", "follow", "raid"]);
        expect(endpoints.map(e => e.slot)).toEqual([...SOUND_SLOTS]);

        expect(endpoints[0]!.upload).toBe("/api/profile/me/alert-sound");
        expect(endpoints[0]!.remove).toBe("/api/profile/me/alert-sound");

        expect(endpoints[1]!.upload).toBe("/api/profile/me/alert-sound/follow");
        expect(endpoints[1]!.remove).toBe("/api/profile/me/alert-sound/follow");

        expect(endpoints[2]!.upload).toBe("/api/profile/me/alert-sound/raid");
        expect(endpoints[2]!.remove).toBe("/api/profile/me/alert-sound/raid");
    });

    test("every slot targets an owner scoped endpoint, never a public username path", () => {
        for (const endpoint of soundSlotEndpoints()) {
            expect(endpoint.upload.startsWith("/api/profile/me/")).toBe(true);
            expect(endpoint.remove.startsWith("/api/profile/me/")).toBe(true);
        }
    });
});
