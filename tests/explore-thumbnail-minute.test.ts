import { describe, expect, test } from "bun:test";
import { thumbnailMinute } from "../src/explore/thumbnail-minute.ts";

describe("thumbnailMinute", () => {
    test("changes when the current minute changes", () => {
        expect(thumbnailMinute(59_999)).toBe(0);
        expect(thumbnailMinute(60_000)).toBe(1);
        expect(thumbnailMinute(180_000)).toBe(3);
    });
});
