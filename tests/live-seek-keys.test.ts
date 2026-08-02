import { expect, test } from "bun:test";
import { seekTargetForKey } from "../src/live/seek-keys.ts";

test("maps DVR slider keys to bounded seek positions", () => {
    expect(seekTargetForKey("ArrowLeft", 30, 10, 50)).toBe(25);
    expect(seekTargetForKey("ArrowRight", 30, 10, 50)).toBe(35);
    expect(seekTargetForKey("ArrowLeft", 12, 10, 50)).toBe(10);
    expect(seekTargetForKey("ArrowRight", 48, 10, 50)).toBe(50);
    expect(seekTargetForKey("Home", 30, 10, 50)).toBe(10);
    expect(seekTargetForKey("End", 30, 10, 50)).toBe(50);
    expect(seekTargetForKey("PageDown", 30, 10, 50)).toBeNull();
});
