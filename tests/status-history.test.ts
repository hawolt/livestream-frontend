import { describe, expect, test } from "bun:test";
import {
    barLevel,
    bucketStarts,
    bucketTitle,
    historyLagsCurrentBucket,
    buildStrip,
    formatDuration,
    historySummary,
    noteText,
    parseHistory,
    windowLabel,
    type HistoryBucket,
} from "../src/status/history.ts";

const NOW = Date.parse("2026-08-07T12:00:00Z");

const DAY = 1440;

function bucket(start: string, total: number, ok: number): HistoryBucket {
    return { start, ok, total, uptime: total > 0 ? (100 * ok) / total : null, downMinutes: total - ok };
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

describe("bucketStarts", () => {
    test("returns bucket starts oldest first ending at the current bucket", () => {
        const daily = bucketStarts(DAY, 3, NOW).map((ms) => new Date(ms).toISOString());
        expect(daily).toEqual([
            "2026-08-05T00:00:00.000Z",
            "2026-08-06T00:00:00.000Z",
            "2026-08-07T00:00:00.000Z",
        ]);
        expect(bucketStarts(DAY, 90, NOW).length).toBe(90);
    });

    test("aligns sixteen minute buckets to the clock", () => {
        const starts = bucketStarts(16, 3, Date.parse("2026-08-07T12:05:00Z"));
        expect(starts.map((ms) => new Date(ms).toISOString())).toEqual([
            "2026-08-07T11:28:00.000Z",
            "2026-08-07T11:44:00.000Z",
            "2026-08-07T12:00:00.000Z",
        ]);
    });
});

describe("buildStrip", () => {
    test("fills every day and leaves gaps without data", () => {
        const strip = buildStrip(
            [bucket("2026-08-06T00:00:00Z", 1440, 1440), bucket("2026-08-07T00:00:00Z", 720, 700)],
            DAY, NOW, 3);

        expect(strip.map((bar) => new Date(bar.startMs).toISOString().slice(0, 10)))
            .toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
        expect(strip.map((bar) => bar.level)).toEqual(["none", "up", "warn"]);
        expect(strip[0].uptime).toBeNull();
        expect(strip[0].title).toBe("2026-08-05: no data");
        expect(strip[1].title).toBe("2026-08-06: 100% uptime");
        expect(strip[2].title).toBe("2026-08-07: 97.22% uptime, 20 min down");
    });

    test("ignores buckets outside the window", () => {
        const strip = buildStrip([bucket("2020-01-01T00:00:00Z", 100, 100)], DAY, NOW, 2);

        expect(strip.length).toBe(2);
        expect(strip.every((bar) => bar.level === "none")).toBe(true);
    });

    test("a fully down day is red", () => {
        const strip = buildStrip([bucket("2026-08-07T00:00:00Z", 720, 0)], DAY, NOW, 1);

        expect(strip[0].level).toBe("down");
        expect(strip[0].title).toBe("2026-08-07: 0% uptime, 720 min down");
    });
});

describe("bucketTitle", () => {
    test("renders a missing bucket as no data", () => {
        expect(bucketTitle(Date.parse("2026-08-07T00:00:00Z"), DAY, undefined)).toBe("2026-08-07: no data");
    });

    test("shows the time of day for sub daily buckets", () => {
        expect(bucketTitle(Date.parse("2026-08-07T11:44:00Z"), 16, undefined))
            .toBe("08-07 11:44 UTC: no data");
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
    test("says how much history actually exists and how wide a bar is", () => {
        expect(historySummary(null, 90 * DAY, DAY, NOW)).toBe("No uptime history recorded yet");
        expect(historySummary("nonsense", 90 * DAY, DAY, NOW)).toBe("No uptime history recorded yet");
        expect(historySummary("2026-01-01T00:00:00Z", 90 * DAY, DAY, NOW))
            .toBe("Uptime history for the last 90 days, one bar per 1 day");
        expect(historySummary("2026-08-06T12:00:00Z", DAY, 16, NOW))
            .toBe("Uptime history for the last 24 hours, one bar per 16 minute");
    });

    test("says when the window is longer than the recorded history", () => {
        expect(historySummary("2026-08-07T09:00:00Z", DAY, 16, NOW))
            .toBe("Uptime history covers 3 hours of the last 24 hours, one bar per 16 minute");
    });
});

describe("windowLabel", () => {
    test("names the known windows", () => {
        expect(windowLabel(DAY)).toBe("24 hours");
        expect(windowLabel(7 * DAY)).toBe("7 days");
        expect(windowLabel(90 * DAY)).toBe("90 days");
    });
});

describe("parseHistory", () => {
    test("parses the documented payload", () => {
        const parsed = parseHistory({
            generatedAt: "2026-08-07T12:00:00Z",
            windowMinutes: 1440,
            bucketMinutes: 16,
            firstSampleAt: "2026-06-01T00:00:00Z",
            checks: [
                {
                    id: "app",
                    label: "Core API",
                    group: "Platform",
                    buckets: [{ start: "2026-08-07T11:52:00Z", ok: 700, total: 720, uptime: 97.22, downMinutes: 20 }],
                },
                {
                    id: "live-eu",
                    label: "Streaming",
                    group: "Media Europe",
                    region: "Europe",
                    buckets: [],
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
        expect(parsed!.windowMinutes).toBe(1440);
        expect(parsed!.bucketMinutes).toBe(16);
        expect(parsed!.firstSampleAt).toBe("2026-06-01T00:00:00Z");
        expect(parsed!.checks.length).toBe(2);
        expect(parsed!.checks[0].buckets[0].downMinutes).toBe(20);
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
        expect(parsed!.checks[0].buckets).toEqual([]);
        expect(parsed!.windowMinutes).toBe(129600);
        expect(parsed!.bucketMinutes).toBe(1440);
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

describe("historyLagsCurrentBucket", () => {
    const base = {
        generatedAt: "2026-08-07T12:00:00Z",
        windowMinutes: 1440,
        bucketMinutes: 16,
        firstSampleAt: "2026-08-07T09:00:00Z",
        incidents: [],
    };

    test("is true once the clock enters a bucket the payload does not cover", () => {
        const history = {
            ...base,
            checks: [{ id: "app", label: "Core API", group: "", region: null, buckets: [bucket("2026-08-07T11:44:00Z", 16, 16)] }],
        };
        expect(historyLagsCurrentBucket(history, Date.parse("2026-08-07T11:50:00Z"))).toBe(false);
        expect(historyLagsCurrentBucket(history, Date.parse("2026-08-07T12:01:00Z"))).toBe(true);
    });

    test("is true when there is no history at all", () => {
        expect(historyLagsCurrentBucket(null, NOW)).toBe(true);
    });
});
