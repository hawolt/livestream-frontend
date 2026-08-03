import {
    detailHandleInEl,
    detailHandleOutEl,
    detailPlayheadEl,
    detailSelectionEl,
    durationEl,
    overviewPlayheadEl,
    overviewSelectionEl,
    overviewViewportEl,
} from "./dom.ts";
import { state } from "./context.ts";
import { formatClipDuration } from "./format.ts";

function pct(ms: number, startMs: number, endMs: number): number {
    const span = endMs - startMs;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, ((ms - startMs) / span) * 100));
}

function renderOverview(playheadMs: number): void {
    const startMs = state.mediaStartMs;
    const endMs = state.nowMs;
    const selStart = pct(state.selectionStartMs, startMs, endMs);
    const selEnd = pct(state.selectionEndMs, startMs, endMs);
    overviewSelectionEl.style.left = `${selStart}%`;
    overviewSelectionEl.style.width = `${Math.max(0, selEnd - selStart)}%`;
    const vpStart = pct(state.viewStartMs, startMs, endMs);
    const vpEnd = pct(state.viewEndMs, startMs, endMs);
    overviewViewportEl.style.left = `${vpStart}%`;
    overviewViewportEl.style.width = `${Math.max(0, vpEnd - vpStart)}%`;
    overviewPlayheadEl.style.left = `${pct(playheadMs, startMs, endMs)}%`;
}

function renderDetail(playheadMs: number): void {
    const startMs = state.viewStartMs;
    const endMs = state.viewEndMs;
    const selStart = pct(state.selectionStartMs, startMs, endMs);
    const selEnd = pct(state.selectionEndMs, startMs, endMs);
    detailSelectionEl.style.left = `${selStart}%`;
    detailSelectionEl.style.width = `${Math.max(0, selEnd - selStart)}%`;
    detailHandleInEl.style.left = `${selStart}%`;
    detailHandleOutEl.style.left = `${selEnd}%`;
    const visible = playheadMs >= startMs && playheadMs <= endMs;
    detailPlayheadEl.style.display = visible ? "" : "none";
    if (visible) detailPlayheadEl.style.left = `${pct(playheadMs, startMs, endMs)}%`;
}

export function renderTimeline(playheadMs: number): void {
    renderOverview(playheadMs);
    renderDetail(playheadMs);
    durationEl.textContent = formatClipDuration(state.selectionEndMs - state.selectionStartMs);
}
