import { expect, test } from "bun:test";
import { farWindowFor, latencyTierFor, latencyWindowFor } from "../src/live/player/latency-window.ts";

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

test("latency tier maps measured rtt to near, mid and far", () => {
    expect(latencyTierFor(27, true)).toBe("near");
    expect(latencyTierFor(60, true)).toBe("near");
    expect(latencyTierFor(61, true)).toBe("mid");
    expect(latencyTierFor(114, true)).toBe("mid");
    expect(latencyTierFor(250, true)).toBe("mid");
    expect(latencyTierFor(251, true)).toBe("far");
    expect(latencyTierFor(900, true)).toBe("far");
});

test("without origin ll a close viewer still only gets the default window", () => {
    expect(latencyTierFor(40, false)).toBe("mid");
    expect(latencyTierFor(900, false)).toBe("far");
});

test("unmeasured or garbage rtt falls back to the default tier", () => {
    expect(latencyTierFor(null, true)).toBe("mid");
    expect(latencyTierFor(Number.NaN, true)).toBe("mid");
    expect(latencyTierFor(-5, true)).toBe("mid");
});

test("far windows scale with segment duration and stay ordered", () => {
    expect(farWindowFor(2)).toEqual({ sync: 8, max: 14 });
    expect(farWindowFor(4.167)).toEqual({ sync: 10.334, max: 20.668 });
    expect(farWindowFor(15)).toEqual({ sync: 15, max: 30 });
    expect(farWindowFor(0)).toBeNull();
    expect(farWindowFor(Number.NaN)).toBeNull();
});
