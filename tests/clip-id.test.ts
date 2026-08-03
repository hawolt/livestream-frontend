import { describe, expect, test } from "bun:test";
import { parseClipIdFromPath } from "../src/clip/id.ts";

describe("parseClipIdFromPath", () => {
    test("parses a valid 16-hex-character id from the second path segment", () => {
        expect(parseClipIdFromPath("/clip/0123456789abcdef")).toBe("0123456789abcdef");
    });

    test("ignores a trailing slash", () => {
        expect(parseClipIdFromPath("/clip/0123456789abcdef/")).toBe("0123456789abcdef");
    });

    test("rejects an id that is too short", () => {
        expect(parseClipIdFromPath("/clip/abc123")).toBeNull();
    });

    test("rejects an id that is too long", () => {
        expect(parseClipIdFromPath("/clip/0123456789abcdef0")).toBeNull();
    });

    test("rejects uppercase hex characters", () => {
        expect(parseClipIdFromPath("/clip/0123456789ABCDEF")).toBeNull();
    });

    test("rejects non-hex characters", () => {
        expect(parseClipIdFromPath("/clip/0123456789abcdeg")).toBeNull();
    });

    test("returns null when the path has no second segment", () => {
        expect(parseClipIdFromPath("/clip")).toBeNull();
        expect(parseClipIdFromPath("/")).toBeNull();
    });
});
