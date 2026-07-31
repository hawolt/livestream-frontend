import { describe, expect, test } from "bun:test";
import { pad2, parseServerTime } from "../src/chat/render.ts";

describe("pad2", () => {
    test("zero-pads single digits and leaves two-digit numbers alone", () => {
        expect(pad2(0)).toBe("00");
        expect(pad2(9)).toBe("09");
        expect(pad2(10)).toBe("10");
        expect(pad2(59)).toBe("59");
    });
});

describe("parseServerTime", () => {
    test("parses a valid server-time tag with a Z offset", () => {
        const d = parseServerTime("2024-03-05T12:34:56Z");
        expect(d.toISOString()).toBe("2024-03-05T12:34:56.000Z");
    });

    test("parses fractional seconds and explicit numeric offsets", () => {
        const withFraction = parseServerTime("2024-03-05T12:34:56.789Z");
        expect(withFraction.getUTCMilliseconds()).toBe(789);
        const withOffset = parseServerTime("2024-03-05T12:34:56+02:00");
        expect(withOffset.toISOString()).toBe("2024-03-05T10:34:56.000Z");
    });

    test("falls back to the current time for an undefined value", () => {
        const before = Date.now();
        const d = parseServerTime(undefined);
        const after = Date.now();
        expect(d.getTime()).toBeGreaterThanOrEqual(before);
        expect(d.getTime()).toBeLessThanOrEqual(after);
    });

    test("falls back to the current time for a value that fails the format check", () => {
        const before = Date.now();
        const d = parseServerTime("not-a-time");
        const after = Date.now();
        expect(d.getTime()).toBeGreaterThanOrEqual(before);
        expect(d.getTime()).toBeLessThanOrEqual(after);
    });

    test("falls back for a value missing the timezone designator", () => {
        const before = Date.now();
        const d = parseServerTime("2024-03-05T12:34:56");
        const after = Date.now();
        expect(d.getTime()).toBeGreaterThanOrEqual(before);
        expect(d.getTime()).toBeLessThanOrEqual(after);
    });
});
