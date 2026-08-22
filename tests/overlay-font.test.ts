import { expect, test } from "bun:test";
import { parseOverlayFont } from "../src/overlay-font.ts";

test("resolves every known font key to a stack with fallbacks", () => {
    for (const key of ["roboto", "sans", "serif", "mono", "condensed", "handwriting"]) {
        const stack = parseOverlayFont(key);
        expect(typeof stack).toBe("string");
        expect(stack!.split(",").length).toBeGreaterThan(1);
    }
});

test("roboto stack leads with the self-hosted family", () => {
    expect(parseOverlayFont("roboto")).toContain(`"Roboto"`);
});

test("falls back to undefined for the system default value", () => {
    expect(parseOverlayFont("system")).toBeUndefined();
});

test("falls back to undefined for an unknown value", () => {
    expect(parseOverlayFont("comic")).toBeUndefined();
    expect(parseOverlayFont("")).toBeUndefined();
});

test("falls back to undefined for a missing param", () => {
    expect(parseOverlayFont(null)).toBeUndefined();
});
