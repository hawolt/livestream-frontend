import {
    btnZoomResetEl,
    detailHandleInEl,
    detailHandleOutEl,
    detailSelectionEl,
    detailTrackEl,
    handleInTooltipEl,
    handleOutTooltipEl,
    overviewTrackEl,
    seekbarTrackEl,
} from "./dom.ts";
import { MAX_SPAN_MS, MIN_SPAN_MS, state } from "./context.ts";
import { clampSelection, type Selection } from "./clamp.ts";
import { moveSelection } from "./span-drag.ts";
import { panWindow, zoomWindow } from "./zoom.ts";
import { formatClipDuration } from "./format.ts";
import { isZoomed, renderTimeline } from "./timeline-render.ts";
import { currentPlayheadMs, seekTo } from "./playhead.ts";

function msFromClientX(track: HTMLElement, clientX: number, startMs: number, endMs: number): number {
    const rect = track.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    return startMs + frac * (endMs - startMs);
}

function totalRelativeMs(): number {
    return Math.max(0, state.nowMs - state.mediaStartMs);
}

function wireOverviewTrack(): void {
    let scrubbing = false;
    const scrub = (ev: PointerEvent) => {
        seekTo(msFromClientX(overviewTrackEl, ev.clientX, state.mediaStartMs, state.nowMs));
    };
    overviewTrackEl.addEventListener("pointerdown", (ev) => {
        if (state.phase !== "ready") return;
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

function wireSeekbar(): void {
    let scrubbing = false;
    const scrub = (ev: PointerEvent) => {
        seekTo(msFromClientX(seekbarTrackEl, ev.clientX, state.mediaStartMs, state.nowMs));
    };
    seekbarTrackEl.addEventListener("pointerdown", (ev) => {
        if (state.phase === "loading-media") return;
        scrubbing = true;
        try {
            seekbarTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
        scrub(ev);
    });
    seekbarTrackEl.addEventListener("pointermove", (ev) => {
        if (scrubbing) scrub(ev);
    });
    const end = (ev: PointerEvent) => {
        if (!scrubbing) return;
        scrubbing = false;
        try {
            seekbarTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    seekbarTrackEl.addEventListener("pointerup", end);
    seekbarTrackEl.addEventListener("pointercancel", end);
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
        if (state.phase !== "ready") return;
        ev.preventDefault();
        const factor = ev.deltaY > 0 ? 1.2 : 1 / 1.2;
        applyZoom(ev.clientX, factor);
    }, { passive: false });

    let dragging = false;
    let dragMoved = false;
    let dragStartX = 0;
    detailTrackEl.addEventListener("pointerdown", (ev) => {
        if (state.phase !== "ready") return;
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

let draggingSpan = false;
let spanDragStartX = 0;
let spanDragOrigin: Selection = { startMs: 0, endMs: 0 };

function wireSelectionSpan(): void {
    detailSelectionEl.addEventListener("pointerdown", (ev) => {
        if (state.phase !== "ready") return;
        draggingSpan = true;
        spanDragStartX = ev.clientX;
        spanDragOrigin = { startMs: state.selectionStartMs, endMs: state.selectionEndMs };
        detailSelectionEl.classList.add("ce-dragging");
        try {
            detailSelectionEl.setPointerCapture(ev.pointerId);
        } catch {}
        ev.preventDefault();
        ev.stopPropagation();
    });
    detailSelectionEl.addEventListener("pointermove", (ev) => {
        if (!draggingSpan) return;
        const rect = detailTrackEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const span = state.viewEndMs - state.viewStartMs;
        const deltaMs = ((ev.clientX - spanDragStartX) / rect.width) * span;
        const result = moveSelection(spanDragOrigin.startMs, spanDragOrigin.endMs, deltaMs, state.mediaStartMs, state.nowMs);
        state.selectionStartMs = result.startMs;
        state.selectionEndMs = result.endMs;
        renderTimeline(currentPlayheadMs());
    });
    const end = (ev: PointerEvent) => {
        if (!draggingSpan) return;
        draggingSpan = false;
        detailSelectionEl.classList.remove("ce-dragging");
        try {
            detailSelectionEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    detailSelectionEl.addEventListener("pointerup", end);
    detailSelectionEl.addEventListener("pointercancel", end);
}

let draggingHandle: "in" | "out" | null = null;

function applyHandleDrag(pos: number): void {
    const result = draggingHandle === "in"
        ? clampSelection(Math.min(pos, state.selectionEndMs - MIN_SPAN_MS), state.selectionEndMs, state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS)
        : clampSelection(state.selectionStartMs, Math.max(pos, state.selectionStartMs + MIN_SPAN_MS), state.mediaStartMs, state.nowMs, MIN_SPAN_MS, MAX_SPAN_MS);
    state.selectionStartMs = result.startMs;
    state.selectionEndMs = result.endMs;
    renderTimeline(currentPlayheadMs());
    const tooltipEl = draggingHandle === "in" ? handleInTooltipEl : handleOutTooltipEl;
    const value = draggingHandle === "in" ? result.startMs : result.endMs;
    tooltipEl.textContent = formatClipDuration(value - state.mediaStartMs);
}

function wireHandle(el: HTMLElement, tooltipEl: HTMLElement, which: "in" | "out"): void {
    el.addEventListener("pointerdown", (ev) => {
        if (state.phase !== "ready") return;
        draggingHandle = which;
        el.classList.add("ce-dragging");
        tooltipEl.textContent = formatClipDuration((which === "in" ? state.selectionStartMs : state.selectionEndMs) - state.mediaStartMs);
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
        el.classList.remove("ce-dragging");
        try {
            el.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

function wireZoomReset(): void {
    btnZoomResetEl.addEventListener("click", () => {
        if (state.phase !== "ready") return;
        state.viewStartMs = state.mediaStartMs;
        state.viewEndMs = state.nowMs;
        renderTimeline(currentPlayheadMs());
    });
}

export function wireTimeline(): void {
    wireOverviewTrack();
    wireSeekbar();
    wireDetailTrack();
    wireSelectionSpan();
    wireHandle(detailHandleInEl, handleInTooltipEl, "in");
    wireHandle(detailHandleOutEl, handleOutTooltipEl, "out");
    wireZoomReset();
}
