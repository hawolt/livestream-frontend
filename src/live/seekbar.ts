import { behindReadoutEl, btnLiveChip, seekBarEl, seekProgressEl, seekThumbEl, seekTrackEl, video } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { LIVE_EDGE_SNAP_S, SEEK_BAR_MIN_SPAN_S, START_BEHIND_S } from "./constants.ts";
import { formatBehind } from "./format.ts";
import { bufferedEnd, bufferedStart } from "./player/mse.ts";
import { hlsLiveSyncPosition } from "./player/hls.ts";
import { activeBufferedRange, behindSeconds, clampToRange, dvrAvailable, isBehindLive, resolveLiveEdge, type BufferedRange } from "./player/dvr-decision.ts";
import { updateClipButtonVisibility } from "./clip/button.ts";

let seekDragging = false;

export function resetSeekDrag(): void {
    seekDragging = false;
}

function bufferedRanges(): BufferedRange[] {
    const b = video.buffered;
    const out: BufferedRange[] = [];
    for (let i = 0; i < b.length; i++) out.push({ start: b.start(i), end: b.end(i) });
    return out;
}

function seekableRange(): BufferedRange | null {
    if (ctx.transportKind === "hls-js") return activeBufferedRange(bufferedRanges(), video.currentTime);
    if (!video.buffered.length) return null;
    return { start: bufferedStart(), end: bufferedEnd() };
}

function liveEdge(): number {
    if (ctx.transportKind === "hls-js") return resolveLiveEdge(hlsLiveSyncPosition(), bufferedEnd());
    return bufferedEnd();
}

export function updateSeekBar(): void {
    updateClipButtonVisibility();
    if (ctx.transportKind !== "ws" && ctx.transportKind !== "hls-js") {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    if (video.paused && !seekDragging) {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    if (ctx.transportKind === "ws") {
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
        return;
    }
    const range = seekableRange();
    if (!dvrAvailable(range, SEEK_BAR_MIN_SPAN_S)) {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    seekBarEl.hidden = false;
    btnLiveChip.hidden = false;
    const r = range as BufferedRange;
    const pos = clampToRange(video.currentTime, r);
    const span = r.end - r.start;
    const pct = span > 0 ? ((pos - r.start) / span) * 100 : 0;
    seekProgressEl.style.width = `${pct}%`;
    seekThumbEl.style.left = `${pct}%`;
    const behind = behindSeconds(liveEdge(), pos);
    if (isBehindLive(behind, LIVE_EDGE_SNAP_S)) {
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
    const range = seekableRange();
    if (!range) return video.currentTime;
    return range.start + frac * (range.end - range.start);
}

export function applySeek(pos: number): void {
    if (ctx.transportKind !== "ws" && ctx.transportKind !== "hls-js") return;
    const range = seekableRange();
    if (!range) return;
    const clamped = clampToRange(pos, range);
    video.currentTime = clamped;
    ctx.behindLive = isBehindLive(behindSeconds(liveEdge(), clamped), LIVE_EDGE_SNAP_S);
    if (!ctx.behindLive) video.playbackRate = 1;
    updateSeekBar();
}

export function goLive(): void {
    if (ctx.transportKind === "hls-js") {
        const edge = liveEdge();
        if (edge <= 0) return;
        const range = seekableRange();
        video.currentTime = range ? clampToRange(edge, range) : edge;
        video.playbackRate = 1;
        ctx.behindLive = false;
        void video.play().catch(() => {});
        updateSeekBar();
        return;
    }
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
        if (ctx.transportKind !== "ws" && ctx.transportKind !== "hls-js") return;
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
    video.addEventListener("pause", updateSeekBar);
    video.addEventListener("play", updateSeekBar);
    btnLiveChip.addEventListener("click", () => {
        if (btnLiveChip.classList.contains("live-chip-behind")) goLive();
    });
}
