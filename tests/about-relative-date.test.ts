import { expect, test } from "bun:test";
import { relativeDate } from "../src/live/about/relative-date.ts";

const NOW = Date.parse("2026-08-14T12:00:00Z");

test("formats recent times in minutes, hours and days", () => {
    expect(relativeDate("2026-08-14T11:59:30Z", NOW)).toBe("just now");
    expect(relativeDate("2026-08-14T11:55:00Z", NOW)).toBe("5m ago");
    expect(relativeDate("2026-08-14T09:00:00Z", NOW)).toBe("3h ago");
    expect(relativeDate("2026-08-12T12:00:00Z", NOW)).toBe("2d ago");
});

test("formats weeks and months for older dates", () => {
    expect(relativeDate("2026-08-01T12:00:00Z", NOW)).toBe("1w ago");
    expect(relativeDate("2026-05-14T12:00:00Z", NOW)).toBe("3mo ago");
});

test("clamps future timestamps to just now instead of going negative", () => {
    expect(relativeDate("2026-08-14T13:00:00Z", NOW)).toBe("just now");
});

test("returns an empty string for unparsable input", () => {
    expect(relativeDate("", NOW)).toBe("");
    expect(relativeDate("not a date", NOW)).toBe("");
});
