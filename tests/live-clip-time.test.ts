import { describe, expect, test } from "bun:test";
import { clampClipTime, formatClipTime, seekTimeFromFraction } from "../src/live/clip/time.ts";

describe("formatClipTime", () => {
    test("formats seconds under a minute", () => {
        expect(formatClipTime(0)).toBe("0:00");
        expect(formatClipTime(5)).toBe("0:05");
        expect(formatClipTime(59)).toBe("0:59");
    });

    test("formats minutes and seconds", () => {
        expect(formatClipTime(60)).toBe("1:00");
        expect(formatClipTime(125)).toBe("2:05");
        expect(formatClipTime(3599)).toBe("59:59");
    });

    test("formats hours once past 3600 seconds", () => {
        expect(formatClipTime(3600)).toBe("1:00:00");
        expect(formatClipTime(3661)).toBe("1:01:01");
        expect(formatClipTime(7325)).toBe("2:02:05");
    });

    test("truncates fractional seconds", () => {
        expect(formatClipTime(5.9)).toBe("0:05");
    });

    test("treats negative or non-finite values as zero", () => {
        expect(formatClipTime(-5)).toBe("0:00");
        expect(formatClipTime(NaN)).toBe("0:00");
        expect(formatClipTime(Infinity)).toBe("0:00");
    });
});

describe("clampClipTime", () => {
    test("clamps within the duration", () => {
        expect(clampClipTime(5, 30)).toBe(5);
        expect(clampClipTime(-5, 30)).toBe(0);
        expect(clampClipTime(45, 30)).toBe(30);
    });

    test("returns zero for a non-finite target", () => {
        expect(clampClipTime(NaN, 30)).toBe(0);
    });

    test("returns zero when duration is unknown or non-positive", () => {
        expect(clampClipTime(5, 0)).toBe(0);
        expect(clampClipTime(5, -1)).toBe(0);
        expect(clampClipTime(5, NaN)).toBe(0);
    });
});

describe("seekTimeFromFraction", () => {
    test("maps a fraction of the duration to a time", () => {
        expect(seekTimeFromFraction(0, 100)).toBe(0);
        expect(seekTimeFromFraction(0.5, 100)).toBe(50);
        expect(seekTimeFromFraction(1, 100)).toBe(100);
    });

    test("clamps fractions outside 0..1", () => {
        expect(seekTimeFromFraction(-0.2, 100)).toBe(0);
        expect(seekTimeFromFraction(1.5, 100)).toBe(100);
    });

    test("returns zero when duration is unknown or non-positive", () => {
        expect(seekTimeFromFraction(0.5, 0)).toBe(0);
        expect(seekTimeFromFraction(0.5, NaN)).toBe(0);
    });
});
