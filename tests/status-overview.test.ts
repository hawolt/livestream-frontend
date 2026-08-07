import { describe, expect, test } from "bun:test";
import {
    formatLatency,
    formatUptime,
    normalizeStatus,
    overallBanner,
    parseOverview,
    relativeTime,
    statusLabel,
} from "../src/status/overview.ts";

describe("normalizeStatus", () => {
    test("passes known statuses through", () => {
        expect(normalizeStatus("operational")).toBe("operational");
        expect(normalizeStatus("degraded")).toBe("degraded");
        expect(normalizeStatus("down")).toBe("down");
    });

    test("maps anything else to unknown", () => {
        expect(normalizeStatus("unknown")).toBe("unknown");
        expect(normalizeStatus("weird")).toBe("unknown");
        expect(normalizeStatus(null)).toBe("unknown");
        expect(normalizeStatus(42)).toBe("unknown");
    });
});

describe("statusLabel", () => {
    test("labels every status", () => {
        expect(statusLabel("operational")).toBe("Operational");
        expect(statusLabel("degraded")).toBe("Degraded");
        expect(statusLabel("down")).toBe("Down");
        expect(statusLabel("unknown")).toBe("Unknown");
    });
});

describe("overallBanner", () => {
    test("maps overall to banner label and class", () => {
        expect(overallBanner("operational")).toEqual({ label: "All systems operational", cls: "operational" });
        expect(overallBanner("degraded")).toEqual({ label: "Some systems are degraded", cls: "degraded" });
        expect(overallBanner("down")).toEqual({ label: "Major outage", cls: "down" });
        expect(overallBanner("unknown")).toEqual({ label: "Status unknown", cls: "unknown" });
    });
});

describe("formatUptime", () => {
    test("renders null as no data", () => {
        expect(formatUptime(null)).toBe("no data");
    });

    test("trims trailing zeros", () => {
        expect(formatUptime(100)).toBe("100%");
        expect(formatUptime(99.9)).toBe("99.9%");
        expect(formatUptime(99.97)).toBe("99.97%");
        expect(formatUptime(0)).toBe("0%");
    });

    test("rounds to two decimals", () => {
        expect(formatUptime(99.987)).toBe("99.99%");
        expect(formatUptime(33.333333)).toBe("33.33%");
    });
});

describe("formatLatency", () => {
    test("renders null as empty", () => {
        expect(formatLatency(null)).toBe("");
    });

    test("rounds to whole milliseconds", () => {
        expect(formatLatency(12)).toBe("12 ms");
        expect(formatLatency(3.6)).toBe("4 ms");
        expect(formatLatency(0)).toBe("0 ms");
    });
});

describe("relativeTime", () => {
    const now = Date.parse("2026-08-07T12:00:00Z");

    test("empty for null or invalid input", () => {
        expect(relativeTime(null, now)).toBe("");
        expect(relativeTime("not-a-date", now)).toBe("");
    });

    test("just now under a minute and for future timestamps", () => {
        expect(relativeTime("2026-08-07T11:59:30Z", now)).toBe("just now");
        expect(relativeTime("2026-08-07T12:00:05Z", now)).toBe("just now");
    });

    test("minutes, hours and days", () => {
        expect(relativeTime("2026-08-07T11:58:00Z", now)).toBe("2m ago");
        expect(relativeTime("2026-08-07T11:00:30Z", now)).toBe("59m ago");
        expect(relativeTime("2026-08-07T09:00:00Z", now)).toBe("3h ago");
        expect(relativeTime("2026-08-04T12:00:00Z", now)).toBe("3d ago");
    });
});

describe("parseOverview", () => {
    const payload = {
        generatedAt: "2026-08-07T12:00:00Z",
        overall: "degraded",
        groups: [
            {
                label: "Platform",
                services: [
                    {
                        id: "app",
                        label: "Core API",
                        status: "operational",
                        latencyMs: 4,
                        uptime24h: 100,
                        uptime90d: null,
                        lastChange: "2026-08-01T00:00:00Z",
                    },
                    {
                        id: "live-eu",
                        label: "Streaming",
                        region: "eu",
                        status: "down",
                        latencyMs: null,
                        uptime24h: 98.5,
                        uptime90d: 99.9,
                        lastChange: null,
                    },
                ],
            },
        ],
    };

    test("parses the overview shape", () => {
        const overview = parseOverview(payload);
        expect(overview).not.toBeNull();
        expect(overview!.overall).toBe("degraded");
        expect(overview!.generatedAt).toBe("2026-08-07T12:00:00Z");
        expect(overview!.groups).toHaveLength(1);
        const [group] = overview!.groups;
        expect(group.label).toBe("Platform");
        expect(group.services).toHaveLength(2);
        expect(group.services[0]).toEqual({
            id: "app",
            label: "Core API",
            region: null,
            status: "operational",
            latencyMs: 4,
            uptime24h: 100,
            uptime90d: null,
            lastChange: "2026-08-01T00:00:00Z",
        });
        expect(group.services[1].region).toBe("eu");
        expect(group.services[1].latencyMs).toBeNull();
        expect(group.services[1].lastChange).toBeNull();
    });

    test("rejects non-object payloads", () => {
        expect(parseOverview(null)).toBeNull();
        expect(parseOverview("nope")).toBeNull();
        expect(parseOverview({})).toBeNull();
        expect(parseOverview({ groups: "x" })).toBeNull();
    });

    test("drops malformed groups and services, normalizes odd statuses", () => {
        const overview = parseOverview({
            overall: "sideways",
            groups: [
                { label: "Ok", services: [{ id: "a", label: "A", status: "sideways" }, { id: 5 }] },
                { services: [] },
                "junk",
            ],
        });
        expect(overview).not.toBeNull();
        expect(overview!.overall).toBe("unknown");
        expect(overview!.generatedAt).toBe("");
        expect(overview!.groups).toHaveLength(1);
        expect(overview!.groups[0].services).toHaveLength(1);
        expect(overview!.groups[0].services[0].status).toBe("unknown");
        expect(overview!.groups[0].services[0].uptime24h).toBeNull();
    });
});
