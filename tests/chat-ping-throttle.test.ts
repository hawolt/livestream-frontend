import { expect, test } from "bun:test";
import { canPing, PING_THROTTLE_MS } from "../src/chat/ping-throttle.ts";

test("allows the first ping when nothing has pinged yet", () => {
    expect(canPing(null, 0)).toBe(true);
    expect(canPing(null, 1_000_000)).toBe(true);
});

test("blocks a ping within the throttle window", () => {
    expect(canPing(1000, 1000 + PING_THROTTLE_MS - 1)).toBe(false);
    expect(canPing(1000, 3999, 3000)).toBe(false);
});

test("allows a ping once the throttle window has fully elapsed", () => {
    expect(canPing(1000, 1000 + PING_THROTTLE_MS)).toBe(true);
    expect(canPing(1000, 4000, 3000)).toBe(true);
    expect(canPing(1000, 5000, 3000)).toBe(true);
});

test("supports a custom throttle window", () => {
    expect(canPing(0, 500, 1000)).toBe(false);
    expect(canPing(0, 1000, 1000)).toBe(true);
});
