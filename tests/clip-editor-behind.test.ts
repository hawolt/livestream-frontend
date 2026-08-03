import { describe, expect, test } from "bun:test";
import { behindMsFromSelection } from "../src/clip-editor/behind.ts";

describe("behindMsFromSelection", () => {
    test("converts a selection ending at now to a zero endBehindMs", () => {
        expect(behindMsFromSelection(100000, 85000, 100000)).toEqual({ startBehindMs: 15000, endBehindMs: 0 });
    });

    test("converts a selection entirely behind now", () => {
        expect(behindMsFromSelection(120000, 90000, 110000)).toEqual({ startBehindMs: 30000, endBehindMs: 10000 });
    });

    test("always yields startBehindMs greater than endBehindMs for a non-empty selection", () => {
        const result = behindMsFromSelection(60000, 40000, 55000);
        expect(result.startBehindMs).toBeGreaterThan(result.endBehindMs);
        expect(result.endBehindMs).toBeGreaterThanOrEqual(0);
    });

    test("rounds fractional millisecond differences", () => {
        expect(behindMsFromSelection(1000.6, 200.2, 800.9)).toEqual({ startBehindMs: 800, endBehindMs: 200 });
    });

    test("handles a selection at the very start of the window", () => {
        expect(behindMsFromSelection(50000, 20000, 23000)).toEqual({ startBehindMs: 30000, endBehindMs: 27000 });
    });
});
