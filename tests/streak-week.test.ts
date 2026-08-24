import { describe, expect, test } from "bun:test";
import { flameSize, FLAME_MAX_PX, FLAME_MIN_PX, streakWeek } from "../src/nav/streak-week.ts";

const WEDNESDAY = Date.parse("2026-08-19T09:30:00Z");
const MONDAY = Date.parse("2026-08-24T00:10:00Z");
const SUNDAY = Date.parse("2026-08-23T23:50:00Z");

function ticked(streak: number, lastVisitAt: number, now: number): string[] {
    return streakWeek(streak, lastVisitAt, now).days.filter(day => day.visited).map(day => day.label);
}

describe("week layout", () => {
    test("always renders Monday to Sunday of the week holding today", () => {
        const week = streakWeek(1, WEDNESDAY, WEDNESDAY);
        expect(week.days.map(day => day.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(week.days.map(day => day.date)).toEqual([
            "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
        ]);
    });

    test("marks today and the days still ahead of it", () => {
        const week = streakWeek(1, WEDNESDAY, WEDNESDAY);
        expect(week.days.filter(day => day.today).map(day => day.date)).toEqual(["2026-08-19"]);
        expect(week.days.filter(day => day.future).map(day => day.label)).toEqual(["Thu", "Fri", "Sat", "Sun"]);
    });

    test("a Sunday visit still belongs to the week that started that Monday", () => {
        const week = streakWeek(1, SUNDAY, SUNDAY);
        expect(week.days[0]!.date).toBe("2026-08-17");
        expect(week.days[6]!.date).toBe("2026-08-23");
        expect(week.days[6]!.today).toBe(true);
        expect(week.visitedThisWeek).toBe(1);
    });

    test("a Monday visit opens a fresh week and leaves the previous one behind", () => {
        const week = streakWeek(3, MONDAY, MONDAY);
        expect(week.days[0]!.date).toBe("2026-08-24");
        expect(ticked(3, MONDAY, MONDAY)).toEqual(["Mon"]);
        expect(week.visitedThisWeek).toBe(1);
    });
});

describe("ticked days", () => {
    test("a streak of 1 ticks only the day of the last visit", () => {
        expect(ticked(1, WEDNESDAY, WEDNESDAY)).toEqual(["Wed"]);
    });

    test("a streak counts backwards from the last visit", () => {
        expect(ticked(3, WEDNESDAY, WEDNESDAY)).toEqual(["Mon", "Tue", "Wed"]);
    });

    test("a streak reaching into last week ticks this week up to today only", () => {
        expect(ticked(9, WEDNESDAY, WEDNESDAY)).toEqual(["Mon", "Tue", "Wed"]);
    });

    test("a streak longer than a week ticks all seven days once the week is complete", () => {
        expect(ticked(40, SUNDAY, SUNDAY)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(streakWeek(40, SUNDAY, SUNDAY).visitedThisWeek).toBe(7);
    });

    test("no streak ticks nothing", () => {
        expect(ticked(0, WEDNESDAY, WEDNESDAY)).toEqual([]);
        expect(ticked(Number.NaN, WEDNESDAY, WEDNESDAY)).toEqual([]);
        expect(ticked(-4, WEDNESDAY, WEDNESDAY)).toEqual([]);
    });
});

describe("lapsed streaks", () => {
    test("a visit today is not lapsed", () => {
        const week = streakWeek(5, WEDNESDAY, WEDNESDAY);
        expect(week.lapsed).toBe(false);
        expect(week.visitedToday).toBe(true);
    });

    test("a visit yesterday is still alive because today can continue it", () => {
        const yesterday = Date.parse("2026-08-18T20:00:00Z");
        const week = streakWeek(5, yesterday, WEDNESDAY);
        expect(week.lapsed).toBe(false);
        expect(week.visitedToday).toBe(false);
        expect(ticked(5, yesterday, WEDNESDAY)).toEqual(["Mon", "Tue"]);
    });

    test("a visit older than yesterday is lapsed and leaves today unticked", () => {
        const lastWeek = Date.parse("2026-08-16T12:00:00Z");
        const week = streakWeek(4, lastWeek, WEDNESDAY);
        expect(week.lapsed).toBe(true);
        expect(week.visitedToday).toBe(false);
        expect(week.visitedThisWeek).toBe(0);
        expect(week.days.every(day => !day.visited)).toBe(true);
    });

    test("a lapsed streak still shows the days it did cover inside this week", () => {
        const monday = Date.parse("2026-08-17T08:00:00Z");
        expect(ticked(2, monday, WEDNESDAY)).toEqual(["Mon"]);
        expect(streakWeek(2, monday, WEDNESDAY).lapsed).toBe(true);
    });
});

describe("clock skew", () => {
    test("a last visit in the future is clamped to today", () => {
        const tomorrow = Date.parse("2026-08-20T09:00:00Z");
        expect(ticked(2, tomorrow, WEDNESDAY)).toEqual(["Tue", "Wed"]);
        expect(streakWeek(2, tomorrow, WEDNESDAY).lapsed).toBe(false);
    });

    test("an unusable last visit falls back to today", () => {
        expect(ticked(1, Number.NaN, WEDNESDAY)).toEqual(["Wed"]);
    });
});

describe("flame size", () => {
    test("starts small on the first day and never shrinks as the streak grows", () => {
        expect(flameSize(1)).toBe(FLAME_MIN_PX);
        expect(flameSize(0)).toBe(FLAME_MIN_PX);
        let previous = flameSize(1);
        for (let streak = 2; streak <= 60; streak++) {
            const size = flameSize(streak);
            expect(size).toBeGreaterThanOrEqual(previous);
            previous = size;
        }
    });

    test("caps once the streak is long enough", () => {
        expect(flameSize(30)).toBe(FLAME_MAX_PX);
        expect(flameSize(4000)).toBe(FLAME_MAX_PX);
        expect(flameSize(Number.NaN)).toBe(FLAME_MIN_PX);
    });
});
