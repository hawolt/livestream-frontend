import { expect, test } from "bun:test";
import {
    STARTUP_HOLD_MAX_MS,
    STARTUP_RUNWAY_S,
    bufferedAheadOf,
    startupHoldOver,
} from "../src/live/player/startup-hold.ts";

test("runway measures from position inside the containing range", () => {
    expect(bufferedAheadOf([{ start: 0, end: 6 }], 2)).toBe(4);
    expect(bufferedAheadOf([{ start: 0, end: 3 }, { start: 10, end: 14 }], 11)).toBe(3);
});

test("position slightly before a range still counts against it", () => {
    expect(bufferedAheadOf([{ start: 1, end: 5 }], 0.6)).toBeCloseTo(4.4);
});

test("no buffer means no runway", () => {
    expect(bufferedAheadOf([], 0)).toBe(0);
});

test("future media and discontinuities are not playable runway", () => {
    expect(bufferedAheadOf([{ start: 100, end: 104 }], 0)).toBe(0);
    expect(bufferedAheadOf([{ start: 0, end: 3 }, { start: 10, end: 14 }], 5)).toBe(0);
    expect(bufferedAheadOf([{ start: 0, end: 3 }, { start: 10, end: 14 }], 2)).toBe(1);
});

test("hold releases on runway or on timeout", () => {
    expect(startupHoldOver(0.4, 1000)).toBe(false);
    expect(startupHoldOver(STARTUP_RUNWAY_S, 0)).toBe(true);
    expect(startupHoldOver(0, STARTUP_HOLD_MAX_MS)).toBe(true);
});
