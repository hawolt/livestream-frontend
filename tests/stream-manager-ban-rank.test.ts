import { describe, expect, test } from "bun:test";
import { banRemovable } from "../src/dash/tabs/stream-manager.ts";

describe("banRemovable", () => {
    test("legacy ranks 1 and 2 are removable", () => {
        expect(banRemovable(1)).toBe(true);
        expect(banRemovable(2)).toBe(true);
    });

    test("legacy rank 3 is a staff ban and not removable", () => {
        expect(banRemovable(3)).toBe(false);
    });

    test("mod, bot and owner ranks are removable", () => {
        expect(banRemovable(10)).toBe(true);
        expect(banRemovable(15)).toBe(true);
        expect(banRemovable(20)).toBe(true);
    });

    test("staff rank 30 and above is not removable", () => {
        expect(banRemovable(30)).toBe(false);
        expect(banRemovable(31)).toBe(false);
        expect(banRemovable(99)).toBe(false);
    });
});
