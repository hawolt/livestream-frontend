import { expect, test } from "bun:test";
import { parseOverlaySize } from "../src/overlay-size.ts";

test("accepts s, l and xl", () => {
    expect(parseOverlaySize("s")).toBe("s");
    expect(parseOverlaySize("l")).toBe("l");
    expect(parseOverlaySize("xl")).toBe("xl");
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
