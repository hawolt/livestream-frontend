import { describe, expect, test } from "bun:test";
import { MAX_RAID_SECONDS, parseRaidCount, parseRaidStart, parseRaidTarget } from "../src/chat/raid-wire.ts";

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
