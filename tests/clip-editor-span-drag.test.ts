import { describe, expect, test } from "bun:test";
import { moveSelection } from "../src/clip-editor/span-drag.ts";

describe("moveSelection", () => {
    test("shifts the selection by delta within bounds", () => {
        expect(moveSelection(20000, 40000, 10000, 0, 100000)).toEqual({ startMs: 30000, endMs: 50000 });
    });

    test("clamps at the left edge without changing the span", () => {
        expect(moveSelection(0, 20000, -5000, 0, 100000)).toEqual({ startMs: 0, endMs: 20000 });
    });

    test("clamps at the right edge without changing the span", () => {
        expect(moveSelection(80000, 100000, 10000, 0, 100000)).toEqual({ startMs: 80000, endMs: 100000 });
    });

    test("preserves the span for an interior move", () => {
        const result = moveSelection(10000, 25000, 2000, 0, 100000);
        expect(result.endMs - result.startMs).toBe(15000);
    });

    test("works with an offset, non-zero-based bound window", () => {
        expect(moveSelection(91000, 96000, 2000, 90000, 100000)).toEqual({ startMs: 93000, endMs: 98000 });
    });

    test("pulls the start back when shifting right would overflow the bound window", () => {
        expect(moveSelection(95000, 99000, 5000, 90000, 100000)).toEqual({ startMs: 96000, endMs: 100000 });
    });

    test("a zero delta leaves the selection untouched", () => {
        expect(moveSelection(12000, 18000, 0, 0, 100000)).toEqual({ startMs: 12000, endMs: 18000 });
    });
});
