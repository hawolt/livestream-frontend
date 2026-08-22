import { expect, test } from "bun:test";
import { parseOverlayWeight } from "../src/overlay-weight.ts";

test("accepts every named weight key", () => {
    expect(parseOverlayWeight("normal")).toBe("normal");
    expect(parseOverlayWeight("bold")).toBe("bold");
    expect(parseOverlayWeight("extrabold")).toBe("extrabold");
});

test("falls back to undefined for an unknown value", () => {
    expect(parseOverlayWeight("black")).toBeUndefined();
    expect(parseOverlayWeight("900")).toBeUndefined();
    expect(parseOverlayWeight("")).toBeUndefined();
});

test("falls back to undefined for a missing param", () => {
    expect(parseOverlayWeight(null)).toBeUndefined();
});
