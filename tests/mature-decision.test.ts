import { describe, expect, test } from "bun:test";
import { ADULT_AGE, blursMatureThumbnail, matureAccess, viewerAgeFor } from "../src/mature-decision.ts";

const YEAR = 2026;

describe("viewerAgeFor", () => {
    test("an eighteenth birthday year counts as adult", () => {
        expect(viewerAgeFor(YEAR - ADULT_AGE, YEAR)).toBe("adult");
        expect(viewerAgeFor(YEAR - 40, YEAR)).toBe("adult");
    });

    test("one year short is a minor", () => {
        expect(viewerAgeFor(YEAR - ADULT_AGE + 1, YEAR)).toBe("minor");
        expect(viewerAgeFor(YEAR, YEAR)).toBe("minor");
    });

    test("a missing birth year is unknown, never a minor", () => {
        expect(viewerAgeFor(null, YEAR)).toBe("unknown");
        expect(viewerAgeFor(undefined, YEAR)).toBe("unknown");
        expect(viewerAgeFor("1990", YEAR)).toBe("unknown");
        expect(viewerAgeFor(0, YEAR)).toBe("unknown");
        expect(viewerAgeFor(-1, YEAR)).toBe("unknown");
        expect(viewerAgeFor(Number.NaN, YEAR)).toBe("unknown");
    });

    test("a future birth year is unusable rather than a minor", () => {
        expect(viewerAgeFor(YEAR + 1, YEAR)).toBe("unknown");
    });
});

describe("matureAccess", () => {
    test("a channel that is not mature always plays", () => {
        expect(matureAccess(false, "unknown", false)).toBe("play");
        expect(matureAccess(false, "minor", false)).toBe("play");
    });

    test("a known adult plays a mature channel with no interstitial", () => {
        expect(matureAccess(true, "adult", false)).toBe("play");
    });

    test("a signed out or age-less viewer gets the click-through interstitial", () => {
        expect(matureAccess(true, "unknown", false)).toBe("confirm");
    });

    test("confirming in memory carries the viewer through", () => {
        expect(matureAccess(true, "unknown", true)).toBe("play");
    });

    test("a known minor is hard locked and cannot confirm past it", () => {
        expect(matureAccess(true, "minor", false)).toBe("locked");
        expect(matureAccess(true, "minor", true)).toBe("locked");
    });
});

describe("blursMatureThumbnail", () => {
    test("nothing that is not mature is ever blurred", () => {
        expect(blursMatureThumbnail(false, "unknown")).toBe(false);
        expect(blursMatureThumbnail(false, "minor")).toBe(false);
        expect(blursMatureThumbnail(false, "adult")).toBe(false);
    });

    test("only a confirmed adult sees a mature thumbnail unblurred", () => {
        expect(blursMatureThumbnail(true, "adult")).toBe(false);
        expect(blursMatureThumbnail(true, "unknown")).toBe(true);
        expect(blursMatureThumbnail(true, "minor")).toBe(true);
    });
});
