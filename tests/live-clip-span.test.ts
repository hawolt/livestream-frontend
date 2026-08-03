import { describe, expect, test } from "bun:test";
import { behindMsFromSelection, clampClipSpan, defaultClipSpan, selectableRange } from "../src/live/clip/span.ts";

const MIN = 3000;
const MAX = 30000;

describe("clampClipSpan", () => {
    test("keeps a span already within bounds untouched", () => {
        expect(clampClipSpan(1000, 6000, 20000, MIN, MAX)).toEqual({ startMs: 1000, endMs: 6000 });
    });

    test("clamps both ends into the buffered span", () => {
        expect(clampClipSpan(-500, 25000, 20000, MIN, MAX)).toEqual({ startMs: 0, endMs: 20000 });
    });

    test("swaps a reversed selection", () => {
        expect(clampClipSpan(8000, 2000, 20000, MIN, MAX)).toEqual({ startMs: 2000, endMs: 8000 });
    });

    test("grows a too-short span forward toward the buffered end", () => {
        expect(clampClipSpan(1000, 1500, 20000, MIN, MAX)).toEqual({ startMs: 1000, endMs: 4000 });
    });

    test("pulls the start back when growing forward would overflow the buffered span", () => {
        expect(clampClipSpan(19000, 19500, 20000, MIN, MAX)).toEqual({ startMs: 17000, endMs: 20000 });
    });

    test("shrinks a too-long span down to the maximum", () => {
        expect(clampClipSpan(0, 35000, 100000, MIN, MAX)).toEqual({ startMs: 0, endMs: 30000 });
    });

    test("shrinks the minimum span itself when the buffered span is shorter than it", () => {
        expect(clampClipSpan(0, 3000, 2000, MIN, MAX)).toEqual({ startMs: 0, endMs: 2000 });
    });
});

describe("defaultClipSpan", () => {
    test("picks a trailing window of the wanted length ending at the buffered edge", () => {
        expect(defaultClipSpan(60000, 15000, MAX)).toEqual({ startMs: 45000, endMs: 60000 });
    });

    test("caps the wanted length at the buffered span when it is shorter", () => {
        expect(defaultClipSpan(10000, 15000, MAX)).toEqual({ startMs: 0, endMs: 10000 });
    });

    test("caps the wanted length at maxSpanMs", () => {
        expect(defaultClipSpan(200000, 45000, MAX)).toEqual({ startMs: 170000, endMs: 200000 });
    });
});

describe("selectableRange", () => {
    test("intersects the buffered range with the pin window when the window is the tighter bound", () => {
        expect(selectableRange(0, 100, 30000)).toEqual({ startSeconds: 70, endSeconds: 100 });
    });

    test("falls back to the buffered start when it is the tighter bound", () => {
        expect(selectableRange(90, 100, 30000)).toEqual({ startSeconds: 90, endSeconds: 100 });
    });

    test("never goes negative even with a window larger than the freeze edge", () => {
        expect(selectableRange(0, 5, 30000)).toEqual({ startSeconds: 0, endSeconds: 5 });
    });
});

describe("behindMsFromSelection", () => {
    test("converts a selection ending at the freeze edge to a zero endBehindMs", () => {
        expect(behindMsFromSelection(100, 85, 100)).toEqual({ startBehindMs: 15000, endBehindMs: 0 });
    });

    test("converts a selection entirely behind the freeze edge", () => {
        expect(behindMsFromSelection(120, 90, 110)).toEqual({ startBehindMs: 30000, endBehindMs: 10000 });
    });

    test("always yields startBehindMs greater than endBehindMs for a non-empty selection", () => {
        const result = behindMsFromSelection(60, 40, 55);
        expect(result.startBehindMs).toBeGreaterThan(result.endBehindMs);
        expect(result.endBehindMs).toBeGreaterThanOrEqual(0);
    });

    test("rounds fractional millisecond differences", () => {
        expect(behindMsFromSelection(10, 5.0001, 9.9994)).toEqual({ startBehindMs: 5000, endBehindMs: 1 });
    });
});
