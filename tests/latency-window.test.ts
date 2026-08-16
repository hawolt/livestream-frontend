import { expect, test } from "bun:test";
import { clampToAdvertisedWindow, farWindowFor, isPhoneUA, latencyTierFor, latencyWindowFor } from "../src/live/player/latency-window.ts";

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
    expect(latencyTierFor(40, true)).toBe("near");
    expect(latencyTierFor(41, true)).toBe("mid");
    expect(latencyTierFor(80, true)).toBe("mid");
    expect(latencyTierFor(81, true)).toBe("far");
    expect(latencyTierFor(114, true)).toBe("far");
    expect(latencyTierFor(900, true)).toBe("far");
});

test("without origin ll a close viewer still only gets the default window", () => {
    expect(latencyTierFor(40, false)).toBe("mid");
    expect(latencyTierFor(900, false)).toBe("far");
});

test("phones never get the near tier", () => {
    expect(latencyTierFor(27, true, true)).toBe("mid");
    expect(latencyTierFor(40, true, true)).toBe("mid");
    expect(latencyTierFor(80, true, true)).toBe("mid");
    expect(latencyTierFor(900, true, true)).toBe("far");
});

test("phone detection prefers client hints and falls back to the user agent", () => {
    expect(isPhoneUA("whatever", true)).toBe(true);
    expect(isPhoneUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", false)).toBe(false);
    expect(isPhoneUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15", null)).toBe(true);
    expect(isPhoneUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36", null)).toBe(true);
    expect(isPhoneUA("Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Safari/537.36", null)).toBe(false);
    expect(isPhoneUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", null)).toBe(false);
    expect(isPhoneUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0", null)).toBe(false);
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

test("windows deeper than the advertised playlist clamp inside it", () => {
    expect(clampToAdvertisedWindow({ sync: 8, max: 14 }, 6, 1)).toEqual({ sync: 4, max: 6 });
    expect(clampToAdvertisedWindow({ sync: 10, max: 24 }, 6, 1)).toEqual({ sync: 4, max: 6 });
});

test("windows that fit the advertised playlist pass through", () => {
    expect(clampToAdvertisedWindow({ sync: 8, max: 14 }, 12, 2)).toEqual({ sync: 8, max: 12 });
    expect(clampToAdvertisedWindow({ sync: 8, max: 14 }, 30, 1)).toEqual({ sync: 8, max: 14 });
    expect(clampToAdvertisedWindow({ sync: 2.5, max: 8 }, 30, 1)).toEqual({ sync: 2.5, max: 8 });
});

test("clamped max always stays above sync by a segment", () => {
    const w = clampToAdvertisedWindow({ sync: 8, max: 14 }, 2, 1);
    expect(w.sync).toBe(1);
    expect(w.max).toBeGreaterThan(w.sync);
});

test("clamp ignores garbage availability", () => {
    expect(clampToAdvertisedWindow({ sync: 8, max: 14 }, Number.NaN, 1)).toEqual({ sync: 8, max: 14 });
    expect(clampToAdvertisedWindow({ sync: 8, max: 14 }, 0, 1)).toEqual({ sync: 8, max: 14 });
});
