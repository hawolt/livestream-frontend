import { expect, test } from "bun:test";
import {
    activityDayTitle,
    activityLevel,
    activityNote,
    formatActivityDuration,
    monthLabel,
    normalizeActivityPayload,
    shiftDayKey,
    todayKey,
    weekdayIndex,
    weekSpan,
    weekStart,
} from "../src/live/about/activity.ts";

test("normalizes the days and activity arrays into one ordered list", () => {
    const entries = normalizeActivityPayload({
        days: ["2026-08-23", "2026-08-22"],
        activity: [
            { day: "2026-08-22", seconds: 14400, secondsKnown: true },
            { day: "2026-08-23", seconds: 0, secondsKnown: false },
        ],
    });
    expect(entries).toEqual([
        { day: "2026-08-22", seconds: 14400, secondsKnown: true },
        { day: "2026-08-23", seconds: 0, secondsKnown: false },
    ]);
});

test("keeps a presence only day as a live day without a duration", () => {
    const entries = normalizeActivityPayload({ days: ["2026-08-22"] });
    expect(entries).toEqual([{ day: "2026-08-22", seconds: 0, secondsKnown: false }]);
});

test("never reports a known duration of zero", () => {
    const entries = normalizeActivityPayload({ activity: [{ day: "2026-08-22", seconds: 0, secondsKnown: true }] });
    expect(entries).toEqual([{ day: "2026-08-22", seconds: 0, secondsKnown: false }]);
});

test("is defensive about missing or malformed input", () => {
    expect(normalizeActivityPayload(undefined)).toEqual([]);
    expect(normalizeActivityPayload(null)).toEqual([]);
    expect(normalizeActivityPayload({})).toEqual([]);
    expect(normalizeActivityPayload({ days: "nope", activity: 7 })).toEqual([]);
    expect(normalizeActivityPayload({ days: [1, null], activity: [null, "x", {}] })).toEqual([]);
    expect(normalizeActivityPayload({ activity: [{ day: "2026-08-22", seconds: "long", secondsKnown: true }] }))
        .toEqual([{ day: "2026-08-22", seconds: 0, secondsKnown: false }]);
});

test("buckets a duration into four levels", () => {
    expect(activityLevel(60)).toBe(1);
    expect(activityLevel(3599)).toBe(1);
    expect(activityLevel(3600)).toBe(2);
    expect(activityLevel(10799)).toBe(2);
    expect(activityLevel(10800)).toBe(3);
    expect(activityLevel(21599)).toBe(3);
    expect(activityLevel(21600)).toBe(4);
});

test("formats a duration in hours and minutes", () => {
    expect(formatActivityDuration(0)).toBe("under a minute");
    expect(formatActivityDuration(59)).toBe("under a minute");
    expect(formatActivityDuration(2700)).toBe("45m");
    expect(formatActivityDuration(7200)).toBe("2h");
    expect(formatActivityDuration(15120)).toBe("4h 12m");
});

test("titles say what a cell means", () => {
    expect(activityDayTitle("2026-08-22", undefined)).toBe("2026-08-22 - no stream");
    expect(activityDayTitle("2026-08-22", { day: "2026-08-22", seconds: 0, secondsKnown: false }))
        .toBe("2026-08-22 - was live, duration unknown");
    expect(activityDayTitle("2026-08-22", { day: "2026-08-22", seconds: 15120, secondsKnown: true }))
        .toBe("2026-08-22 - live 4h 12m");
});

test("summarizes days, streamed time and days without duration data", () => {
    expect(activityNote([])).toBe("0 days live");
    expect(activityNote([{ day: "2026-08-22", seconds: 3600, secondsKnown: true }])).toBe("1 day live, 1h streamed");
    expect(activityNote([
        { day: "2026-08-22", seconds: 3600, secondsKnown: true },
        { day: "2026-08-23", seconds: 0, secondsKnown: false },
    ])).toBe("2 days live, 1h streamed, 1 day without duration data");
});

test("aligns day keys to monday started weeks", () => {
    expect(weekdayIndex("2026-08-24")).toBe(0);
    expect(weekdayIndex("2026-08-16")).toBe(6);
    expect(weekStart("2026-08-16")).toBe("2026-08-10");
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
    expect(shiftDayKey("2026-08-31", -7)).toBe("2026-08-24");
    expect(weekSpan("2026-08-10", "2026-08-24")).toBe(3);
    expect(weekSpan("2026-08-24", "2026-08-24")).toBe(1);
    expect(monthLabel("2026-08-24")).toBe("Aug");
});

test("reads today from a fixed clock", () => {
    expect(todayKey(Date.UTC(2026, 7, 24, 15, 43))).toBe("2026-08-24");
});
