import { describe, expect, test } from "bun:test";
import { canUnpin, isNearBottom, pinnedAfterScroll, type ScrollGeometry } from "../src/multichat-pin.ts";

const atBottom: ScrollGeometry = { scrollHeight: 1000, scrollTop: 800, clientHeight: 200 };
const scrolledUp: ScrollGeometry = { scrollHeight: 1000, scrollTop: 200, clientHeight: 200 };
const grown: ScrollGeometry = { scrollHeight: 1400, scrollTop: 800, clientHeight: 200 };
const fits: ScrollGeometry = { scrollHeight: 200, scrollTop: 0, clientHeight: 200 };

describe("isNearBottom", () => {
    test("true when the gap is under the threshold", () => {
        expect(isNearBottom(atBottom)).toBe(true);
    });

    test("false once the gap exceeds the threshold", () => {
        expect(isNearBottom(scrolledUp)).toBe(false);
    });

    test("true when content fits without overflowing", () => {
        expect(isNearBottom(fits)).toBe(true);
    });
});

describe("pinnedAfterScroll", () => {
    test("a scroll event never unpins when async layout growth opens the gap", () => {
        expect(pinnedAfterScroll(true, grown)).toBe(true);
    });

    test("a scroll event never unpins even when scrolled far up", () => {
        expect(pinnedAfterScroll(true, scrolledUp)).toBe(true);
    });

    test("scrolling back to the bottom re-pins", () => {
        expect(pinnedAfterScroll(false, atBottom)).toBe(true);
    });

    test("staying scrolled up leaves an unpinned view unpinned", () => {
        expect(pinnedAfterScroll(false, scrolledUp)).toBe(false);
    });
});

describe("canUnpin", () => {
    test("overlay mode never unpins, so an OBS source cannot freeze", () => {
        expect(canUnpin(true, scrolledUp)).toBe(false);
    });

    test("a normal embed unpins on a user gesture", () => {
        expect(canUnpin(false, scrolledUp)).toBe(true);
    });

    test("no unpin when there is nothing to scroll", () => {
        expect(canUnpin(false, fits)).toBe(false);
    });
});
