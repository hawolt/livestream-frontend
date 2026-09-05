import { expect, test } from "bun:test";
import { recoveryDeadlineMs } from "../src/live/player/recovery-deadline.ts";

test("watchdog allows the full far-tier recovery grace", () => {
    expect(recoveryDeadlineMs(15000, 20000)).toBe(20000);
    expect(recoveryDeadlineMs(20000, 30000)).toBe(30000);
});

test("short waiting grace does not shorten the watchdog", () => {
    expect(recoveryDeadlineMs(15000, 8000)).toBe(15000);
});
