import type { Selection } from "./clamp.ts";

export function moveSelection(startMs: number, endMs: number, deltaMs: number, boundStartMs: number, boundEndMs: number): Selection {
    const lo = Math.min(boundStartMs, boundEndMs);
    const hi = Math.max(boundStartMs, boundEndMs);
    const span = endMs - startMs;
    let s = startMs + deltaMs;
    let e = endMs + deltaMs;
    if (s < lo) {
        e += lo - s;
        s = lo;
    }
    if (e > hi) {
        s -= e - hi;
        e = hi;
    }
    s = Math.max(lo, s);
    e = Math.min(hi, s + span);
    return { startMs: s, endMs: e };
}
