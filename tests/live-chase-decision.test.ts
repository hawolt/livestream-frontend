import { describe, expect, test } from "bun:test";
import { decideChase } from "../src/live/player/chase-decision.ts";

const thresholds = { seekGapS: 6, chaseGapS: 1.3, chaseStopS: 0.8, guardOffsetS: 3 };

function decide(edge: number, currentTime: number, behindLive = false, bufferedStart = 0) {
    return decideChase({ behindLive, edge, currentTime, bufferedStart, ...thresholds });
}

describe("live edge gap decision (not behind live)", () => {
    test("snaps back to the live edge once the gap exceeds the seek threshold", () => {
        expect(decide(10, 3.9)).toBe("snap");
        expect(decide(10, 0)).toBe("snap");
    });

    test("speeds up playback while inside the chase-rate window", () => {
        expect(decide(10, 10 - 1.31)).toBe("chase-rate");
        expect(decide(10, 10 - 6)).toBe("chase-rate");
        expect(decide(10, 10 - 5.99)).toBe("chase-rate");
    });

    test("holds the current rate in the dead zone between chase-stop and chase-gap", () => {
        expect(decide(10, 9.2)).toBe("hold");
        expect(decide(10, 9.0)).toBe("hold");
        expect(decide(10, 8.8)).toBe("hold");
    });

    test("returns to normal rate once caught up below the chase-stop threshold", () => {
        expect(decide(10, 10 - 0.79)).toBe("normal-rate");
        expect(decide(10, 10)).toBe("normal-rate");
        expect(decide(10, 10 + 1)).toBe("normal-rate");
    });
});

describe("behindLive suppresses the live edge gap decision", () => {
    test("ignores how far behind the edge playback is once behindLive is set", () => {
        expect(decide(1000, 0, true, 0)).toBe("guard-snap");
        expect(decide(6.01, 0, false, 0)).toBe("snap");
    });

    test("snaps forward when playback drifts before the buffered-start guard", () => {
        expect(decide(50, 4, true, 2)).toBe("guard-snap");
        expect(decide(50, 4.99, true, 2)).toBe("guard-snap");
    });

    test("does nothing once playback clears the guard", () => {
        expect(decide(50, 5, true, 2)).toBe("none");
        expect(decide(50, 10, true, 2)).toBe("none");
    });
});
