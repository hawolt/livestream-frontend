import { describe, expect, test } from "bun:test";
import { MAX_RAID_SECONDS, parseRaidIncoming, parseRaidStart } from "../src/chat/raid-wire.ts";

describe("parseRaidStart", () => {
    test("accepts a valid target and countdown", () => {
        expect(parseRaidStart("SomeStreamer", "20")).toEqual({ target: "somestreamer", seconds: 20 });
    });

    test("lowercases the target", () => {
        expect(parseRaidStart("MiXeD_Case-99", "5")?.target).toBe("mixed_case-99");
    });

    test("rejects missing params", () => {
        expect(parseRaidStart(undefined, undefined)).toBeNull();
        expect(parseRaidStart("target", undefined)).toBeNull();
        expect(parseRaidStart(undefined, "20")).toBeNull();
    });

    test("rejects invalid target shapes", () => {
        expect(parseRaidStart("ab", "20")).toBeNull();
        expect(parseRaidStart("a".repeat(33), "20")).toBeNull();
        expect(parseRaidStart("bad name", "20")).toBeNull();
        expect(parseRaidStart("bad/name", "20")).toBeNull();
        expect(parseRaidStart("../etc", "20")).toBeNull();
    });

    test("rejects invalid countdowns", () => {
        expect(parseRaidStart("target", "0")).toBeNull();
        expect(parseRaidStart("target", "-5")).toBeNull();
        expect(parseRaidStart("target", "2.5")).toBeNull();
        expect(parseRaidStart("target", "nope")).toBeNull();
        expect(parseRaidStart("target", String(MAX_RAID_SECONDS + 1))).toBeNull();
    });

    test("accepts the maximum countdown", () => {
        expect(parseRaidStart("target", String(MAX_RAID_SECONDS))?.seconds).toBe(MAX_RAID_SECONDS);
    });
});

describe("parseRaidIncoming", () => {
    test("accepts a valid raider and viewer count", () => {
        expect(parseRaidIncoming("Raider_1", "42")).toEqual({ raider: "Raider_1", viewers: 42 });
    });

    test("keeps the raider display casing", () => {
        expect(parseRaidIncoming("BigStreamer", "3")?.raider).toBe("BigStreamer");
    });

    test("clamps missing or invalid viewer counts to zero", () => {
        expect(parseRaidIncoming("raider", undefined)?.viewers).toBe(0);
        expect(parseRaidIncoming("raider", "nope")?.viewers).toBe(0);
        expect(parseRaidIncoming("raider", "-4")?.viewers).toBe(0);
    });

    test("floors fractional viewer counts", () => {
        expect(parseRaidIncoming("raider", "7.9")?.viewers).toBe(7);
    });

    test("rejects invalid raider names", () => {
        expect(parseRaidIncoming(undefined, "5")).toBeNull();
        expect(parseRaidIncoming("ab", "5")).toBeNull();
        expect(parseRaidIncoming("bad name", "5")).toBeNull();
    });
});
