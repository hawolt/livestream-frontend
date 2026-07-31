import { describe, expect, test } from "bun:test";
import { quotaTrimOnCleanAppend, quotaTrimOnFailure, type QuotaTrimState } from "../src/live/player/quota.ts";

const FLOOR = 5;
const RESTORE = 300;

describe("quotaTrimOnFailure", () => {
    test("does not shrink the keep window on the first failure in a streak", () => {
        const start: QuotaTrimState = { keepS: 300, failStreak: 0 };
        const next = quotaTrimOnFailure(start, FLOOR);
        expect(next).toEqual({ keepS: 300, failStreak: 1 });
    });

    test("halves the keep window on the second and later consecutive failures", () => {
        let state: QuotaTrimState = { keepS: 300, failStreak: 0 };
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 300, failStreak: 1 });
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 150, failStreak: 2 });
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 75, failStreak: 3 });
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 37.5, failStreak: 4 });
    });

    test("never trims the keep window below the floor", () => {
        let state: QuotaTrimState = { keepS: 8, failStreak: 5 };
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 5, failStreak: 6 });
        state = quotaTrimOnFailure(state, FLOOR);
        expect(state).toEqual({ keepS: 5, failStreak: 7 });
    });
});

describe("quotaTrimOnCleanAppend", () => {
    test("restores the keep window to the configured default and resets the streak", () => {
        expect(quotaTrimOnCleanAppend(RESTORE)).toEqual({ keepS: 300, failStreak: 0 });
    });

    test("restores to whatever default is passed in", () => {
        expect(quotaTrimOnCleanAppend(120)).toEqual({ keepS: 120, failStreak: 0 });
    });
});
