import { behindReadoutEl, btnLiveChip, seekBarEl, seekProgressEl, seekThumbEl, seekTrackEl, video } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { LIVE_EDGE_SNAP_S, SEEK_BAR_MIN_SPAN_S, START_BEHIND_S } from "./constants.ts";
import { formatBehind } from "./format.ts";
import { bufferedEnd, bufferedStart } from "./player/mse.ts";

let seekDragging = false;

export function resetSeekDrag(): void {
    seekDragging = false;
}

export function updateSeekBar(): void {
    if (ctx.transportKind !== "ws") {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    const b = video.buffered;
    const start = bufferedStart();
    const end = bufferedEnd();
    const span = end - start;
    if (!b.length || span < SEEK_BAR_MIN_SPAN_S) {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    seekBarEl.hidden = false;
    btnLiveChip.hidden = false;
    const pos = Math.min(end, Math.max(start, video.currentTime));
    const pct = ((pos - start) / span) * 100;
    seekProgressEl.style.width = `${pct}%`;
    seekThumbEl.style.left = `${pct}%`;
    const behind = end - pos;
    if (behind > LIVE_EDGE_SNAP_S) {
        behindReadoutEl.hidden = false;
        behindReadoutEl.textContent = formatBehind(behind);
        btnLiveChip.textContent = "GO LIVE";
        btnLiveChip.classList.add("live-chip-behind");
        btnLiveChip.classList.remove("live-chip-live");
    } else {
        behindReadoutEl.hidden = true;
        btnLiveChip.textContent = "LIVE";
        btnLiveChip.classList.remove("live-chip-behind");
        btnLiveChip.classList.add("live-chip-live");
    }
}

function seekPosFromEvent(ev: PointerEvent): number {
    const rect = seekTrackEl.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) : 0;
    const start = bufferedStart();
    const end = bufferedEnd();
    return start + frac * (end - start);
}

export function applySeek(pos: number): void {
    if (ctx.transportKind !== "ws" || !video.buffered.length) return;
    const start = bufferedStart();
    const end = bufferedEnd();
    const clamped = Math.min(end, Math.max(start, pos));
    video.currentTime = clamped;
    ctx.behindLive = end - clamped > LIVE_EDGE_SNAP_S;
    if (!ctx.behindLive) video.playbackRate = 1;
    updateSeekBar();
}

export function goLive(): void {
    const edge = bufferedEnd();
    if (edge <= 0) return;
    video.currentTime = Math.max(0, edge - START_BEHIND_S);
    video.playbackRate = 1;
    ctx.behindLive = false;
    void video.play().catch(() => {});
    updateSeekBar();
}

export function wireSeekBar(): void {
    const onDown = (ev: PointerEvent) => {
        if (ctx.transportKind !== "ws") return;
        seekDragging = true;
        try {
            seekTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
        applySeek(seekPosFromEvent(ev));
    };
    const onMove = (ev: PointerEvent) => {
        if (!seekDragging) return;
        applySeek(seekPosFromEvent(ev));
    };
    const onUp = (ev: PointerEvent) => {
        if (!seekDragging) return;
        seekDragging = false;
        try {
            seekTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    seekTrackEl.addEventListener("pointerdown", onDown);
    seekTrackEl.addEventListener("pointermove", onMove);
    seekTrackEl.addEventListener("pointerup", onUp);
    seekTrackEl.addEventListener("pointercancel", onUp);
    btnLiveChip.addEventListener("click", () => {
        if (btnLiveChip.classList.contains("live-chip-behind")) goLive();
    });
}
