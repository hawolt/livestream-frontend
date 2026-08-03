import { describe, expect, test } from "bun:test";
import { clampSelection } from "../src/clip-editor/clamp.ts";

const MIN = 3000;
const MAX = 30000;

describe("clampSelection", () => {
    test("keeps a selection already within bounds untouched", () => {
        expect(clampSelection(1000, 6000, 0, 20000, MIN, MAX)).toEqual({ startMs: 1000, endMs: 6000 });
    });

    test("clamps both ends into the bound window", () => {
        expect(clampSelection(-500, 25000, 0, 20000, MIN, MAX)).toEqual({ startMs: 0, endMs: 20000 });
    });

    test("works with an offset, non-zero-based bound window", () => {
        expect(clampSelection(90500, 96000, 90000, 100000, MIN, MAX)).toEqual({ startMs: 90500, endMs: 96000 });
    });

    test("swaps a reversed selection", () => {
        expect(clampSelection(8000, 2000, 0, 20000, MIN, MAX)).toEqual({ startMs: 2000, endMs: 8000 });
    });

    test("grows a too-short span forward toward the bound end", () => {
        expect(clampSelection(1000, 1500, 0, 20000, MIN, MAX)).toEqual({ startMs: 1000, endMs: 4000 });
    });

    test("pulls the start back when growing forward would overflow the bound window", () => {
        expect(clampSelection(19000, 19500, 0, 20000, MIN, MAX)).toEqual({ startMs: 17000, endMs: 20000 });
    });

    test("shrinks a too-long span down to the maximum", () => {
        expect(clampSelection(0, 35000, 0, 100000, MIN, MAX)).toEqual({ startMs: 0, endMs: 30000 });
    });

    test("shrinks the minimum span itself when the bound window is shorter than it", () => {
        expect(clampSelection(0, 3000, 0, 2000, MIN, MAX)).toEqual({ startMs: 0, endMs: 2000 });
    });
});
