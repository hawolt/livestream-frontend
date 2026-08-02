import { expect, test } from "bun:test";
import { formatBehind, formatUptime } from "../src/live/format.ts";

test("formats uptime across second, minute and hour boundaries", () => {
    expect(formatUptime(0)).toBe("0:00:00:00");
    expect(formatUptime(1)).toBe("0:00:00:01");
    expect(formatUptime(59)).toBe("0:00:00:59");
    expect(formatUptime(60)).toBe("0:00:01:00");
    expect(formatUptime(3599)).toBe("0:00:59:59");
    expect(formatUptime(3600)).toBe("0:01:00:00");
    expect(formatUptime(86399)).toBe("0:23:59:59");
    expect(formatUptime(86400)).toBe("1:00:00:00");
    expect(formatUptime(90061)).toBe("1:01:01:01");
});

test("formats behind-live readout with minute rounding and hour prefix", () => {
    expect(formatBehind(0)).toBe("-0:00");
    expect(formatBehind(5)).toBe("-0:05");
    expect(formatBehind(5.4)).toBe("-0:05");
    expect(formatBehind(5.6)).toBe("-0:06");
    expect(formatBehind(59)).toBe("-0:59");
    expect(formatBehind(60)).toBe("-1:00");
    expect(formatBehind(3599)).toBe("-59:59");
    expect(formatBehind(3600)).toBe("-1:00:00");
    expect(formatBehind(3661)).toBe("-1:01:01");
});

test("clamps negative values to zero", () => {
    expect(formatBehind(-5)).toBe("-0:00");
    expect(formatBehind(-0.4)).toBe("-0:00");
});
