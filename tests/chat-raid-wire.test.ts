import { describe, expect, test } from "bun:test";
import { MAX_RAID_SECONDS, parseRaidCount, parseRaidIncoming, parseRaidStart, parseRaidTarget } from "../src/chat/raid-wire.ts";

describe("parseRaidStart", () => {
    test("accepts a valid target and countdown", () => {
        expect(parseRaidStart("SomeStreamer", "20")).toEqual({ target: "somestreamer", seconds: 20, count: 0 });
    });

    test("reads the raider count from the fourth param", () => {
        expect(parseRaidStart("Bob", "20", "5")).toEqual({ target: "bob", seconds: 20, count: 5 });
    });

    test("defaults the count to zero for the legacy three param form", () => {
        expect(parseRaidStart("bob", "20")?.count).toBe(0);
    });

    test("defaults the count to zero for a garbage fourth param", () => {
        expect(parseRaidStart("bob", "20", "x")?.count).toBe(0);
        expect(parseRaidStart("bob", "20", "-1")?.count).toBe(0);
        expect(parseRaidStart("bob", "20", "2.5")?.count).toBe(0);
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

describe("parseRaidCount", () => {
    test("accepts non negative integers", () => {
        expect(parseRaidCount("0")).toBe(0);
        expect(parseRaidCount("12")).toBe(12);
    });

    test("rejects missing and malformed counts", () => {
        expect(parseRaidCount(undefined)).toBeNull();
        expect(parseRaidCount("x")).toBeNull();
        expect(parseRaidCount("-1")).toBeNull();
        expect(parseRaidCount("2.5")).toBeNull();
    });
});

describe("parseRaidTarget", () => {
    test("lowercases a valid target", () => {
        expect(parseRaidTarget("Bob")).toBe("bob");
    });

    test("rejects invalid targets", () => {
        expect(parseRaidTarget("ab")).toBeNull();
        expect(parseRaidTarget("bad name")).toBeNull();
        expect(parseRaidTarget(undefined)).toBeNull();
    });
});
