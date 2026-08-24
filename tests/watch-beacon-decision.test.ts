import { describe, expect, test } from "bun:test";
import { watchBeaconActive, watchBeaconBody, watchBeaconStartsRun } from "../src/live/watch-beacon-decision.ts";

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

describe("watch beacon run start", () => {
    test("a run with no beacon yet starts", () => {
        expect(watchBeaconStartsRun(null, "alpha")).toBe(true);
    });

    test("a further beacon on the same channel does not start a run", () => {
        expect(watchBeaconStartsRun("alpha", "alpha")).toBe(false);
    });

    test("a beacon on another channel starts a new run", () => {
        expect(watchBeaconStartsRun("alpha", "beta")).toBe(true);
    });

    test("channel names are compared exactly", () => {
        expect(watchBeaconStartsRun("alpha", "Alpha")).toBe(true);
    });
});

describe("watch beacon body", () => {
    test("carries channel, surface and the start marker", () => {
        expect(JSON.parse(watchBeaconBody("alpha", "channel", true))).toEqual({
            channel: "alpha",
            surface: "channel",
            start: true,
        });
    });

    test("a heartbeat carries an explicit false start marker", () => {
        expect(JSON.parse(watchBeaconBody("alpha", "embed", false))).toEqual({
            channel: "alpha",
            surface: "embed",
            start: false,
        });
    });

    test("the clip surface rides the body", () => {
        expect(JSON.parse(watchBeaconBody("alpha", "clip", true)).surface).toBe("clip");
    });
});
