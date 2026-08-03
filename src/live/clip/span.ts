export interface ClipSpan {
    startMs: number;
    endMs: number;
}

export function clampClipSpan(startMs: number, endMs: number, bufferedSpanMs: number, minSpanMs: number, maxSpanMs: number): ClipSpan {
    const cap = Math.max(0, bufferedSpanMs);
    let s = Math.max(0, Math.min(startMs, cap));
    let e = Math.max(0, Math.min(endMs, cap));
    if (e < s) {
        const t = s;
        s = e;
        e = t;
    }
    let span = e - s;
    const minSpan = Math.min(minSpanMs, cap);
    if (span < minSpan) {
        const deficit = minSpan - span;
        e = Math.min(cap, e + deficit);
        span = e - s;
        if (span < minSpan) {
            s = Math.max(0, e - minSpan);
        }
    } else if (span > maxSpanMs) {
        e = s + maxSpanMs;
    }
    return { startMs: s, endMs: e };
}

export function defaultClipSpan(bufferedSpanMs: number, spanMs: number, maxSpanMs: number): ClipSpan {
    const wanted = Math.min(spanMs, maxSpanMs, bufferedSpanMs);
    const endMs = bufferedSpanMs;
    const startMs = Math.max(0, endMs - wanted);
    return { startMs, endMs };
}

export interface SelectableRange {
    startSeconds: number;
    endSeconds: number;
}

export function selectableRange(bufferedStartSeconds: number, freezeEdgeSeconds: number, windowMs: number): SelectableRange {
    const windowStartSeconds = freezeEdgeSeconds - windowMs / 1000;
    const startSeconds = Math.max(bufferedStartSeconds, windowStartSeconds, 0);
    const endSeconds = Math.max(startSeconds, freezeEdgeSeconds);
    return { startSeconds, endSeconds };
}

export interface BehindSpan {
    startBehindMs: number;
    endBehindMs: number;
}

export function behindMsFromSelection(freezeEdgeSeconds: number, selectionStartSeconds: number, selectionEndSeconds: number): BehindSpan {
    return {
        startBehindMs: Math.round((freezeEdgeSeconds - selectionStartSeconds) * 1000),
        endBehindMs: Math.round((freezeEdgeSeconds - selectionEndSeconds) * 1000),
    };
}
