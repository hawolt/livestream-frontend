import { describe, expect, test } from "bun:test";
import { watchBeaconActive } from "../src/live/watch-beacon-decision.ts";

describe("watch beacon activity gate", () => {
    test("active while playing and visible", () => {
        expect(watchBeaconActive(false, false, "visible")).toBe(true);
    });

    test("inactive while paused", () => {
        expect(watchBeaconActive(true, false, "visible")).toBe(false);
    });

    test("inactive once ended", () => {
        expect(watchBeaconActive(false, true, "visible")).toBe(false);
    });

    test("inactive while the tab is hidden", () => {
        expect(watchBeaconActive(false, false, "hidden")).toBe(false);
    });

    test("paused and hidden together stay inactive", () => {
        expect(watchBeaconActive(true, true, "hidden")).toBe(false);
    });
});
