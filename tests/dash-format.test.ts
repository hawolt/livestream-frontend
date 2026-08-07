import { describe, expect, test } from "bun:test";
import { esc, fmtDate, fmtTime, fmtUptime, maskSecret } from "../src/dash/format.ts";

describe("fmtDate", () => {
    test("formats a local date as d.m.y", () => {
        expect(fmtDate(new Date(2024, 2, 5, 10, 20, 30))).toBe("05.03.2024");
    });

    test("pads single-digit day and month", () => {
        expect(fmtDate(new Date(2026, 0, 5, 0, 0))).toBe("05.01.2026");
    });

    test("returns a dash for missing input", () => {
        expect(fmtDate(null)).toBe("-");
        expect(fmtDate(undefined)).toBe("-");
    });
});

describe("fmtTime", () => {
    test("formats local hours, minutes and seconds", () => {
        expect(fmtTime(new Date(2024, 2, 5, 10, 20, 30))).toBe("10:20:30");
    });

    test("pads single-digit hours, minutes and seconds", () => {
        expect(fmtTime(new Date(2026, 0, 15, 4, 5))).toBe("04:05:00");
    });

    test("returns a dash for missing input", () => {
        expect(fmtTime(null)).toBe("-");
        expect(fmtTime(undefined)).toBe("-");
    });
});

describe("esc", () => {
    test("escapes html-sensitive characters", () => {
        expect(esc(`<a href="x" data='y'>&\`</a>`)).toBe(
            "&lt;a href=&quot;x&quot; data=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;",
        );
    });

    test("coerces missing input to an empty string", () => {
        expect(esc(null)).toBe("");
        expect(esc(undefined)).toBe("");
    });
});

describe("fmtUptime", () => {
    test("pads hours, minutes, seconds to two digits", () => {
        expect(fmtUptime(0)).toBe("00:00:00");
        expect(fmtUptime(5)).toBe("00:00:05");
        expect(fmtUptime(65)).toBe("00:01:05");
        expect(fmtUptime(3661)).toBe("01:01:01");
    });

    test("rolls hours past 24 rather than wrapping to days", () => {
        expect(fmtUptime(90000)).toBe("25:00:00");
    });
});

describe("maskSecret", () => {
    test("masks a non-empty value with fixed-length bullets", () => {
        expect(maskSecret("short")).toBe("•".repeat(16));
        expect(maskSecret("a-very-long-secret-value")).toBe("•".repeat(16));
    });

    test("returns an empty string for an empty value", () => {
        expect(maskSecret("")).toBe("");
    });
});
