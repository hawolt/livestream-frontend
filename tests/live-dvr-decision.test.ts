import { describe, expect, test } from "bun:test";
import {
    activeBufferedRange,
    behindSeconds,
    clampToRange,
    dvrAvailable,
    isBehindLive,
    resolveLiveEdge,
} from "../src/live/player/dvr-decision.ts";

describe("activeBufferedRange", () => {
    test("returns null for an empty ranges list", () => {
        expect(activeBufferedRange([], 10)).toBeNull();
    });

    test("returns the range containing currentTime", () => {
        const ranges = [{ start: 0, end: 20 }, { start: 280, end: 300 }];
        expect(activeBufferedRange(ranges, 290)).toEqual({ start: 280, end: 300 });
        expect(activeBufferedRange(ranges, 5)).toEqual({ start: 0, end: 20 });
    });

    test("treats the range boundaries as inclusive", () => {
        const ranges = [{ start: 0, end: 20 }];
        expect(activeBufferedRange(ranges, 0)).toEqual({ start: 0, end: 20 });
        expect(activeBufferedRange(ranges, 20)).toEqual({ start: 0, end: 20 });
    });

    test("falls back to the last range when currentTime lands in a gap", () => {
        const ranges = [{ start: 0, end: 20 }, { start: 280, end: 300 }];
        expect(activeBufferedRange(ranges, 150)).toEqual({ start: 280, end: 300 });
    });
});

describe("clampToRange", () => {
    const range = { start: 10, end: 40 };

    test("passes through positions already inside the range", () => {
        expect(clampToRange(25, range)).toBe(25);
    });

    test("never returns a position before the range start", () => {
        expect(clampToRange(0, range)).toBe(10);
        expect(clampToRange(-5, range)).toBe(10);
    });

    test("never returns a position past the range end", () => {
        expect(clampToRange(100, range)).toBe(40);
    });
});

describe("dvrAvailable", () => {
    test("is false when there is no active range", () => {
        expect(dvrAvailable(null, 10)).toBe(false);
    });

    test("is false when the buffered span is under the minimum", () => {
        expect(dvrAvailable({ start: 0, end: 9.99 }, 10)).toBe(false);
    });

    test("is true once the buffered span reaches the minimum", () => {
        expect(dvrAvailable({ start: 0, end: 10 }, 10)).toBe(true);
        expect(dvrAvailable({ start: 290, end: 305 }, 10)).toBe(true);
    });
});

describe("resolveLiveEdge", () => {
    test("prefers hls.js liveSyncPosition when it is a positive number", () => {
        expect(resolveLiveEdge(120.5, 100)).toBe(120.5);
    });

    test("falls back to the buffered end when liveSyncPosition is null", () => {
        expect(resolveLiveEdge(null, 100)).toBe(100);
    });

    test("falls back to the buffered end when liveSyncPosition is not positive", () => {
        expect(resolveLiveEdge(0, 100)).toBe(100);
        expect(resolveLiveEdge(-1, 100)).toBe(100);
    });
});

describe("behindSeconds", () => {
    test("returns the gap between the live edge and the current position", () => {
        expect(behindSeconds(300, 250)).toBe(50);
    });

    test("never goes negative when playback is ahead of the tracked edge", () => {
        expect(behindSeconds(100, 105)).toBe(0);
    });
});

describe("isBehindLive", () => {
    test("is false at and below the snap threshold", () => {
        expect(isBehindLive(2, 2)).toBe(false);
        expect(isBehindLive(1.9, 2)).toBe(false);
    });

    test("is true once the gap exceeds the snap threshold", () => {
        expect(isBehindLive(2.1, 2)).toBe(true);
    });
});
