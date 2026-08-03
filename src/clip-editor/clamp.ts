export interface Selection {
    startMs: number;
    endMs: number;
}

export function clampSelection(
    startMs: number,
    endMs: number,
    boundStartMs: number,
    boundEndMs: number,
    minSpanMs: number,
    maxSpanMs: number,
): Selection {
    const lo = Math.min(boundStartMs, boundEndMs);
    const hi = Math.max(boundStartMs, boundEndMs);
    let s = Math.max(lo, Math.min(startMs, hi));
    let e = Math.max(lo, Math.min(endMs, hi));
    if (e < s) {
        const t = s;
        s = e;
        e = t;
    }
    let span = e - s;
    const boundSpan = hi - lo;
    const minSpan = Math.min(minSpanMs, boundSpan);
    if (span < minSpan) {
        const deficit = minSpan - span;
        e = Math.min(hi, e + deficit);
        span = e - s;
        if (span < minSpan) s = Math.max(lo, e - minSpan);
    } else if (span > maxSpanMs) {
        e = s + maxSpanMs;
    }
    return { startMs: s, endMs: e };
}
