export function formatClipTime(totalSeconds: number): string {
    const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
    const total = Math.floor(safe);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function clampClipTime(target: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    if (!Number.isFinite(target)) return 0;
    return Math.min(duration, Math.max(0, target));
}

export function seekTimeFromFraction(fraction: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const clampedFraction = Math.min(1, Math.max(0, fraction));
    return clampedFraction * duration;
}
