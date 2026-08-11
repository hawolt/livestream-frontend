import { expect, test } from "bun:test";
import { formatBehind, formatUptime } from "../src/live/format.ts";

test("formats uptime without leading zero units", () => {
    expect(formatUptime(0)).toBe("0:00");
    expect(formatUptime(1)).toBe("0:01");
    expect(formatUptime(59)).toBe("0:59");
    expect(formatUptime(60)).toBe("1:00");
    expect(formatUptime(182)).toBe("3:02");
    expect(formatUptime(3599)).toBe("59:59");
    expect(formatUptime(3600)).toBe("1:00:00");
    expect(formatUptime(3661)).toBe("1:01:01");
    expect(formatUptime(42967)).toBe("11:56:07");
    expect(formatUptime(86399)).toBe("23:59:59");
    expect(formatUptime(86400)).toBe("1:00:00:00");
    expect(formatUptime(100809)).toBe("1:04:00:09");
    expect(formatUptime(1036800)).toBe("12:00:00:00");
});

test("clamps negative and fractional uptime", () => {
    expect(formatUptime(-5)).toBe("0:00");
    expect(formatUptime(61.9)).toBe("1:01");
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
