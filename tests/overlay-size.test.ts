import { expect, test } from "bun:test";
import { parseOverlaySize } from "../src/overlay-size.ts";

test("accepts the named steps s, l and xl", () => {
    expect(parseOverlaySize("s")).toEqual({ step: "s" });
    expect(parseOverlaySize("l")).toEqual({ step: "l" });
    expect(parseOverlaySize("xl")).toEqual({ step: "xl" });
});

test("falls back to undefined for the medium default", () => {
    expect(parseOverlaySize("m")).toBeUndefined();
});

test("falls back to undefined for an unknown value", () => {
    expect(parseOverlaySize("huge")).toBeUndefined();
    expect(parseOverlaySize("")).toBeUndefined();
});

test("falls back to undefined for a missing param", () => {
    expect(parseOverlaySize(null)).toBeUndefined();
});

test("accepts a raw pixel integer", () => {
    expect(parseOverlaySize("48")).toEqual({ px: 48 });
    expect(parseOverlaySize("20")).toEqual({ px: 20 });
});

test("clamps a pixel value below the minimum", () => {
    expect(parseOverlaySize("1")).toEqual({ px: 10 });
    expect(parseOverlaySize("0")).toEqual({ px: 10 });
});

test("clamps a pixel value above the maximum", () => {
    expect(parseOverlaySize("500")).toEqual({ px: 120 });
});

test("falls back to undefined for junk numeric input", () => {
    expect(parseOverlaySize("48px")).toBeUndefined();
    expect(parseOverlaySize("-10")).toBeUndefined();
    expect(parseOverlaySize("4.5")).toBeUndefined();
    expect(parseOverlaySize("1e2")).toBeUndefined();
    expect(parseOverlaySize("NaN")).toBeUndefined();
});
