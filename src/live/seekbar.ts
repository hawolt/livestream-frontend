import { behindReadoutEl, btnLiveChip, seekBarEl, seekProgressEl, seekThumbEl, seekTrackEl, video } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { LIVE_EDGE_SNAP_S, SEEK_BAR_MIN_SPAN_S, START_BEHIND_S } from "./constants.ts";
import { formatBehind } from "./format.ts";
import { bufferedEnd, bufferedStart } from "./player/mse.ts";
import { seekTargetForKey } from "./seek-keys.ts";

let seekDragging = false;

function updateSliderAccessibility(start: number, end: number, pos: number): void {
    const behind = Math.max(0, end - pos);
    const roundedBehind = Math.round(behind);
    seekTrackEl.setAttribute("aria-valuemin", String(start));
    seekTrackEl.setAttribute("aria-valuemax", String(end));
    seekTrackEl.setAttribute("aria-valuenow", String(pos));
    seekTrackEl.setAttribute("aria-valuetext", behind <= LIVE_EDGE_SNAP_S
        ? "Live"
        : `${roundedBehind} second${roundedBehind === 1 ? "" : "s"} behind live`);
}

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
    updateSliderAccessibility(start, end, pos);
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
    const requested = Math.min(end, Math.max(start, pos));
    const clamped = end - requested <= LIVE_EDGE_SNAP_S
        ? Math.max(start, end - START_BEHIND_S)
        : requested;
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
    seekTrackEl.setAttribute("role", "slider");
    seekTrackEl.setAttribute("aria-label", "Stream position");
    seekTrackEl.setAttribute("aria-orientation", "horizontal");
    seekTrackEl.setAttribute("aria-valuemin", "0");
    seekTrackEl.setAttribute("aria-valuemax", "0");
    seekTrackEl.setAttribute("aria-valuenow", "0");
    seekTrackEl.setAttribute("aria-valuetext", "Live");
    seekTrackEl.tabIndex = 0;
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
    const onKeyDown = (ev: KeyboardEvent) => {
        if (ctx.transportKind !== "ws" || !video.buffered.length) return;
        const target = seekTargetForKey(ev.key, video.currentTime, bufferedStart(), bufferedEnd());
        if (target === null) return;
        ev.preventDefault();
        applySeek(target);
    };
    seekTrackEl.addEventListener("pointerdown", onDown);
    seekTrackEl.addEventListener("pointermove", onMove);
    seekTrackEl.addEventListener("pointerup", onUp);
    seekTrackEl.addEventListener("pointercancel", onUp);
    seekTrackEl.addEventListener("keydown", onKeyDown);
    btnLiveChip.addEventListener("click", () => {
        if (btnLiveChip.classList.contains("live-chip-behind")) goLive();
    });
}
