import { describe, expect, test } from "bun:test";
import { currentTimeFromMediaMs, mediaMsFromCurrentTime } from "../src/clip-editor/media-timeline.ts";

describe("mediaMsFromCurrentTime", () => {
    test("adds the media offset to a zero-based currentTime", () => {
        expect(mediaMsFromCurrentTime(0, 3300000)).toBe(3300000);
    });

    test("converts seconds to milliseconds before adding the offset", () => {
        expect(mediaMsFromCurrentTime(12.5, 3300000)).toBe(3312500);
    });

    test("works with a zero offset", () => {
        expect(mediaMsFromCurrentTime(45, 0)).toBe(45000);
    });
});

describe("currentTimeFromMediaMs", () => {
    test("returns zero at the media offset", () => {
        expect(currentTimeFromMediaMs(3300000, 3300000)).toBe(0);
    });

    test("converts milliseconds past the offset to seconds", () => {
        expect(currentTimeFromMediaMs(3312500, 3300000)).toBe(12.5);
    });

    test("works with a zero offset", () => {
        expect(currentTimeFromMediaMs(45000, 0)).toBe(45);
    });
});

describe("mediaMsFromCurrentTime and currentTimeFromMediaMs round trip", () => {
    test("recovers the original media ms for arbitrary offsets", () => {
        const cases: Array<[number, number]> = [
            [0, 0],
            [0, 3300000],
            [15000, 5400000],
            [299500, 1000],
        ];
        for (const [mediaMs, offsetMs] of cases) {
            const currentTime = currentTimeFromMediaMs(mediaMs, offsetMs);
            expect(mediaMsFromCurrentTime(currentTime, offsetMs)).toBeCloseTo(mediaMs, 6);
        }
    });

    test("recovers the original currentTime for arbitrary offsets", () => {
        const cases: Array<[number, number]> = [
            [0, 0],
            [12.5, 3300000],
            [180, 5400000],
        ];
        for (const [currentTime, offsetMs] of cases) {
            const mediaMs = mediaMsFromCurrentTime(currentTime, offsetMs);
            expect(currentTimeFromMediaMs(mediaMs, offsetMs)).toBeCloseTo(currentTime, 6);
        }
    });
});
