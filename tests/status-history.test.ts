import { describe, expect, test } from "bun:test";
import {
    barLevel,
    bucketTitle,
    buildStrip,
    dayKeys,
    formatDuration,
    historySummary,
    noteText,
    parseHistory,
    utcDayKey,
    type HistoryBucket,
} from "../src/status/history.ts";

const NOW = Date.parse("2026-08-07T12:00:00Z");

function bucket(day: string, total: number, ok: number): HistoryBucket {
    return { day, ok, total, uptime: total > 0 ? (100 * ok) / total : null, downMinutes: total - ok };
}

describe("barLevel", () => {
    test("maps uptime to a bar color", () => {
        expect(barLevel(null)).toBe("none");
        expect(barLevel(100)).toBe("up");
        expect(barLevel(99.5)).toBe("up");
        expect(barLevel(99.4)).toBe("warn");
        expect(barLevel(97)).toBe("warn");
        expect(barLevel(96.9)).toBe("down");
        expect(barLevel(0)).toBe("down");
    });
});

describe("dayKeys", () => {
    test("returns UTC days oldest first ending today", () => {
        expect(dayKeys(3, NOW)).toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
        expect(dayKeys(1, NOW)).toEqual(["2026-08-07"]);
        expect(dayKeys(90, NOW).length).toBe(90);
        expect(utcDayKey(NOW)).toBe("2026-08-07");
    });
});

describe("buildStrip", () => {
    test("fills every day and leaves gaps without data", () => {
        const strip = buildStrip([bucket("2026-08-06", 1440, 1440), bucket("2026-08-07", 720, 700)], 3, NOW);

        expect(strip.map((bar) => bar.day)).toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
        expect(strip.map((bar) => bar.level)).toEqual(["none", "up", "warn"]);
        expect(strip[0].uptime).toBeNull();
        expect(strip[0].title).toBe("2026-08-05: no data");
        expect(strip[1].title).toBe("2026-08-06: 100% uptime");
        expect(strip[2].title).toBe("2026-08-07: 97.22% uptime, 20 min down");
    });

    test("ignores buckets outside the window", () => {
        const strip = buildStrip([bucket("2020-01-01", 100, 100)], 2, NOW);

        expect(strip.length).toBe(2);
        expect(strip.every((bar) => bar.level === "none")).toBe(true);
    });

    test("a fully down day is red", () => {
        const strip = buildStrip([bucket("2026-08-07", 720, 0)], 1, NOW);

        expect(strip[0].level).toBe("down");
        expect(strip[0].title).toBe("2026-08-07: 0% uptime, 720 min down");
    });
});

describe("bucketTitle", () => {
    test("renders a missing bucket as no data", () => {
        expect(bucketTitle("2026-08-07", undefined)).toBe("2026-08-07: no data");
    });
});

describe("formatDuration", () => {
    test("renders minutes, hours and days", () => {
        expect(formatDuration(0)).toBe("under a minute");
        expect(formatDuration(0.4)).toBe("under a minute");
        expect(formatDuration(34)).toBe("34m");
        expect(formatDuration(60)).toBe("1h");
        expect(formatDuration(134)).toBe("2h 14m");
        expect(formatDuration(1440)).toBe("1d");
        expect(formatDuration(1440 + 120)).toBe("1d 2h");
    });
});

describe("noteText", () => {
    test("trims, caps and drops empty notes", () => {
        expect(noteText(null)).toBe("");
        expect(noteText("   ")).toBe("");
        expect(noteText("  media host reboot ")).toBe("media host reboot");
        expect(noteText("x".repeat(400)).length).toBe(280);
    });
});

describe("historySummary", () => {
    test("says how much history actually exists", () => {
        expect(historySummary(null, 90, NOW)).toBe("No uptime history recorded yet");
        expect(historySummary("nonsense", 90, NOW)).toBe("No uptime history recorded yet");
        expect(historySummary("2026-08-07T09:00:00Z", 90, NOW)).toBe("Uptime history since today, showing 90 days");
        expect(historySummary("2026-07-08T12:00:00Z", 90, NOW)).toBe("Uptime history covers 30 of the last 90 days");
        expect(historySummary("2026-01-01T00:00:00Z", 90, NOW)).toBe("Uptime history for the last 90 days");
    });
});

describe("parseHistory", () => {
    test("parses the documented payload", () => {
        const parsed = parseHistory({
            generatedAt: "2026-08-07T12:00:00Z",
            days: 90,
            firstSampleAt: "2026-06-01T00:00:00Z",
            checks: [
                {
                    id: "app",
                    label: "Core API",
                    group: "Platform",
                    days: [{ day: "2026-08-07", ok: 700, total: 720, uptime: 97.22, downMinutes: 20 }],
                },
                {
                    id: "live-eu",
                    label: "Streaming",
                    group: "Media Europe",
                    region: "Europe",
                    days: [],
                },
            ],
            incidents: [
                {
                    id: 7,
                    checkId: "app",
                    label: "Core API",
                    startedAt: "2026-08-07T10:00:00Z",
                    endedAt: "2026-08-07T10:34:00Z",
                    resolved: true,
                    durationMinutes: 34,
                    note: "media host reboot",
                },
            ],
        });

        expect(parsed).not.toBeNull();
        expect(parsed!.days).toBe(90);
        expect(parsed!.firstSampleAt).toBe("2026-06-01T00:00:00Z");
        expect(parsed!.checks.length).toBe(2);
        expect(parsed!.checks[0].days[0].downMinutes).toBe(20);
        expect(parsed!.checks[0].region).toBeNull();
        expect(parsed!.checks[1].region).toBe("Europe");
        expect(parsed!.incidents[0].note).toBe("media host reboot");
        expect(parsed!.incidents[0].resolved).toBe(true);
    });

    test("tolerates missing and malformed pieces", () => {
        const parsed = parseHistory({
            checks: [{ id: "app", label: "Core API" }, { label: "no id" }, 42],
            incidents: [{ id: 1, startedAt: "2026-08-07T10:00:00Z" }, { startedAt: "x" }],
        });

        expect(parsed).not.toBeNull();
        expect(parsed!.checks.length).toBe(1);
        expect(parsed!.checks[0].days).toEqual([]);
        expect(parsed!.days).toBe(90);
        expect(parsed!.firstSampleAt).toBeNull();
        expect(parsed!.incidents.length).toBe(1);
        expect(parsed!.incidents[0].resolved).toBe(false);
        expect(parsed!.incidents[0].note).toBeNull();
    });

    test("rejects payloads without checks", () => {
        expect(parseHistory(null)).toBeNull();
        expect(parseHistory({})).toBeNull();
        expect(parseHistory("nope")).toBeNull();
    });
});
