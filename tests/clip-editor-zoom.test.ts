import { describe, expect, test } from "bun:test";
import { panWindow, zoomWindow } from "../src/clip-editor/zoom.ts";

describe("zoomWindow", () => {
    test("zooms in around the cursor, keeping it fixed", () => {
        expect(zoomWindow({ startMs: 0, endMs: 100000 }, 50000, 0.5, 100000, 3000)).toEqual({
            startMs: 25000,
            endMs: 75000,
        });
    });

    test("zooms out, clamped to the total range", () => {
        expect(zoomWindow({ startMs: 40000, endMs: 60000 }, 50000, 3, 100000, 3000)).toEqual({
            startMs: 20000,
            endMs: 80000,
        });
    });

    test("never zooms in past the minimum span", () => {
        expect(zoomWindow({ startMs: 0, endMs: 10000 }, 5000, 0.001, 100000, 3000)).toEqual({
            startMs: 3500,
            endMs: 6500,
        });
    });

    test("never zooms out past the total range", () => {
        const result = zoomWindow({ startMs: 40000, endMs: 60000 }, 50000, 100, 100000, 3000);
        expect(result).toEqual({ startMs: 0, endMs: 100000 });
    });

    test("pulls the window back when zooming out would overflow the right edge", () => {
        expect(zoomWindow({ startMs: 90000, endMs: 100000 }, 95000, 2, 100000, 3000)).toEqual({
            startMs: 80000,
            endMs: 100000,
        });
    });

    test("pulls the window back when zooming out would overflow the left edge", () => {
        expect(zoomWindow({ startMs: 0, endMs: 10000 }, 5000, 2, 100000, 3000)).toEqual({
            startMs: 0,
            endMs: 20000,
        });
    });
});

describe("panWindow", () => {
    test("shifts the window by the given delta", () => {
        expect(panWindow({ startMs: 20000, endMs: 40000 }, 10000, 100000)).toEqual({
            startMs: 30000,
            endMs: 50000,
        });
    });

    test("clamps at the left edge without changing the span", () => {
        expect(panWindow({ startMs: 0, endMs: 20000 }, -5000, 100000)).toEqual({
            startMs: 0,
            endMs: 20000,
        });
    });

    test("clamps at the right edge without changing the span", () => {
        expect(panWindow({ startMs: 80000, endMs: 100000 }, 10000, 100000)).toEqual({
            startMs: 80000,
            endMs: 100000,
        });
    });

    test("preserves the span for an interior pan", () => {
        const result = panWindow({ startMs: 10000, endMs: 25000 }, 2000, 100000);
        expect(result.endMs - result.startMs).toBe(15000);
    });
});
