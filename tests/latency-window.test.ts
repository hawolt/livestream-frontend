import { expect, test } from "bun:test";
import { latencyWindowFor } from "../src/live/player/latency-window.ts";

test("compliant 2s segments keep the tuned defaults", () => {
    expect(latencyWindowFor(2)).toBeNull();
    expect(latencyWindowFor(3)).toBeNull();
    expect(latencyWindowFor(4)).toBeNull();
});

test("large segments widen the window past one segment duration", () => {
    const w = latencyWindowFor(9);
    expect(w).toEqual({ sync: 12, max: 27 });
    expect(w!.max).toBeGreaterThan(9);
    expect(w!.max).toBeGreaterThan(w!.sync);
});

test("extreme segments clamp but stay ordered", () => {
    const w = latencyWindowFor(15);
    expect(w).toEqual({ sync: 15, max: 30 });
    expect(w!.max).toBeGreaterThan(w!.sync);
});

test("garbage input is ignored", () => {
    expect(latencyWindowFor(NaN)).toBeNull();
    expect(latencyWindowFor(Infinity)).toBeNull();
    expect(latencyWindowFor(0)).toBeNull();
});
