export interface ViewWindow {
    startMs: number;
    endMs: number;
}

export function zoomWindow(view: ViewWindow, cursorMs: number, factor: number, totalMs: number, minSpanMs: number): ViewWindow {
    const span = Math.max(1, view.endMs - view.startMs);
    const rawSpan = span * factor;
    const newSpan = Math.min(totalMs, Math.max(Math.min(minSpanMs, totalMs), rawSpan));
    const cursor = Math.min(view.endMs, Math.max(view.startMs, cursorMs));
    const frac = span > 0 ? (cursor - view.startMs) / span : 0.5;
    let start = cursor - frac * newSpan;
    let end = start + newSpan;
    if (start < 0) {
        end -= start;
        start = 0;
    }
    if (end > totalMs) {
        start -= end - totalMs;
        end = totalMs;
    }
    start = Math.max(0, start);
    end = Math.min(totalMs, Math.max(start, end));
    return { startMs: start, endMs: end };
}

export function panWindow(view: ViewWindow, deltaMs: number, totalMs: number): ViewWindow {
    const span = view.endMs - view.startMs;
    let start = view.startMs + deltaMs;
    let end = view.endMs + deltaMs;
    if (start < 0) {
        end -= start;
        start = 0;
    }
    if (end > totalMs) {
        start -= end - totalMs;
        end = totalMs;
    }
    start = Math.max(0, start);
    end = Math.min(totalMs, start + span);
    return { startMs: start, endMs: end };
}
