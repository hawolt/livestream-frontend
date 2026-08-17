import { describe, expect, test } from "bun:test";
import { hidePlayerControls } from "../src/live/player/controls-decision.ts";

describe("player control bar visibility", () => {
    test("hides the bar on an offline channel", () => {
        expect(hidePlayerControls("offline", false)).toBe(true);
    });

    test("keeps the bar while there is something to control", () => {
        expect(hidePlayerControls("playing", false)).toBe(false);
        expect(hidePlayerControls("buffering", false)).toBe(false);
        expect(hidePlayerControls("connecting", false)).toBe(false);
        expect(hidePlayerControls("reconnecting", false)).toBe(false);
    });

    test("keeps the bar in clip mode, which never leaves the offline transport state", () => {
        expect(hidePlayerControls("offline", true)).toBe(false);
    });
});
