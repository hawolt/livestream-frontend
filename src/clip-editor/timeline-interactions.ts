import { detailHandleInEl, detailHandleOutEl, detailTrackEl, overviewTrackEl, videoEl } from "./dom.ts";
import { MAX_SPAN_MS, MIN_SPAN_MS, state } from "./context.ts";
import { clampSelection } from "./clamp.ts";
import { panWindow, zoomWindow } from "./zoom.ts";
import { renderTimeline } from "./timeline-render.ts";

function currentPlayheadMs(): number {
    return videoEl.currentTime * 1000;
}

function clampPlayheadMs(ms: number): number {
    return Math.min(state.nowMs, Math.max(state.mediaStartMs, ms));
}

function seekTo(ms: number): void {
    const clamped = clampPlayheadMs(ms);
    try {
        videoEl.currentTime = clamped / 1000;
    } catch {}
    renderTimeline(clamped);
}

function msFromClientX(track: HTMLElement, clientX: number, startMs: number, endMs: number): number {
    const rect = track.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    return startMs + frac * (endMs - startMs);
}

function totalRelativeMs(): number {
    return Math.max(0, state.nowMs - state.mediaStartMs);
}

function isZoomed(): boolean {
    return state.viewEndMs - state.viewStartMs < totalRelativeMs() - 1;
}

function wireOverviewTrack(): void {
    let scrubbing = false;
    const scrub = (ev: PointerEvent) => {
        seekTo(msFromClientX(overviewTrackEl, ev.clientX, state.mediaStartMs, state.nowMs));
    };
    overviewTrackEl.addEventListener("pointerdown", (ev) => {
        scrubbing = true;
        try {
            overviewTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
        scrub(ev);
    });
    overviewTrackEl.addEventListener("pointermove", (ev) => {
        if (scrubbing) scrub(ev);
    });
    const end = (ev: PointerEvent) => {
        if (!scrubbing) return;
        scrubbing = false;
        try {
            overviewTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    overviewTrackEl.addEventListener("pointerup", end);
    overviewTrackEl.addEventListener("pointercancel", end);
}

function applyZoom(cursorClientX: number, factor: number): void {
    const cursorMs = msFromClientX(detailTrackEl, cursorClientX, state.viewStartMs, state.viewEndMs) - state.mediaStartMs;
    const view = { startMs: state.viewStartMs - state.mediaStartMs, endMs: state.viewEndMs - state.mediaStartMs };
    const next = zoomWindow(view, cursorMs, factor, totalRelativeMs(), MIN_SPAN_MS);
    state.viewStartMs = next.startMs + state.mediaStartMs;
    state.viewEndMs = next.endMs + state.mediaStartMs;
    renderTimeline(currentPlayheadMs());
}

function applyPan(deltaPx: number): void {
    const rect = detailTrackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const span = state.viewEndMs - state.viewStartMs;
    const deltaMs = (deltaPx / rect.width) * span;
    const view = { startMs: state.viewStartMs - state.mediaStartMs, endMs: state.viewEndMs - state.mediaStartMs };
    const next = panWindow(view, -deltaMs, totalRelativeMs());
    state.viewStartMs = next.startMs + state.mediaStartMs;
    state.viewEndMs = next.endMs + state.mediaStartMs;
    renderTimeline(currentPlayheadMs());
}

function wireDetailTrack(): void {
    detailTrackEl.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        const factor = ev.deltaY > 0 ? 1.2 : 1 / 1.2;
        applyZoom(ev.clientX, factor);
    }, { passive: false });

    let dragging = false;
    let dragMoved = false;
    let dragStartX = 0;
    detailTrackEl.addEventListener("pointerdown", (ev) => {
        if (ev.target !== detailTrackEl) return;
        dragging = true;
        dragMoved = false;
        dragStartX = ev.clientX;
        try {
            detailTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
    });
    detailTrackEl.addEventListener("pointermove", (ev) => {
        if (!dragging) return;
        const deltaPx = ev.clientX - dragStartX;
        if (Math.abs(deltaPx) > 2) dragMoved = true;
        if (isZoomed()) {
            applyPan(deltaPx);
            dragStartX = ev.clientX;
        }
    });
    const endDrag = (ev: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try {
            detailTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
        if (!dragMoved) seekTo(msFromClientX(detailTrackEl, ev.clientX, state.viewStartMs, state.viewEndMs));
    };
    detailTrackEl.addEventListener("pointerup", endDrag);
    detailTrackEl.addEventListener("pointercancel", endDrag);
}

let draggingHandle: "in" | "out" | null = null;

function applyHandleDrag(pos: number): void {
    const result = draggingHandle === "in"
        ? clampSelection(Math.min(pos, state.selectionEndMs - MIN_SPAN_MS), state.selectionEndMs, state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS)
        : clampSelection(state.selectionStartMs, Math.max(pos, state.selectionStartMs + MIN_SPAN_MS), state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS);
    state.selectionStartMs = result.startMs;
    state.selectionEndMs = result.endMs;
    renderTimeline(currentPlayheadMs());
}

function wireHandle(el: HTMLElement, which: "in" | "out"): void {
    el.addEventListener("pointerdown", (ev) => {
        draggingHandle = which;
        try {
            el.setPointerCapture(ev.pointerId);
        } catch {}
        ev.preventDefault();
        ev.stopPropagation();
    });
    el.addEventListener("pointermove", (ev) => {
        if (draggingHandle !== which) return;
        applyHandleDrag(msFromClientX(detailTrackEl, ev.clientX, state.viewStartMs, state.viewEndMs));
    });
    const end = (ev: PointerEvent) => {
        if (draggingHandle !== which) return;
        draggingHandle = null;
        try {
            el.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

export function wireTimeline(): void {
    wireOverviewTrack();
    wireDetailTrack();
    wireHandle(detailHandleInEl, "in");
    wireHandle(detailHandleOutEl, "out");
}
