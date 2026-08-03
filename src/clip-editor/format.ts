export function formatClipDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatClipLengthSeconds(ms: number): string {
    const seconds = Math.max(0, ms) / 1000;
    return `${seconds.toFixed(1)}s`;
}
