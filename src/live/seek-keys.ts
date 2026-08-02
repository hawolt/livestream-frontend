export const SEEK_KEY_STEP_S = 5;

function clamp(value: number, start: number, end: number): number {
    return Math.min(end, Math.max(start, value));
}

export function seekTargetForKey(key: string, current: number, start: number, end: number): number | null {
    if (key === "Home") return start;
    if (key === "End") return end;
    if (key === "ArrowLeft") return clamp(current - SEEK_KEY_STEP_S, start, end);
    if (key === "ArrowRight") return clamp(current + SEEK_KEY_STEP_S, start, end);
    return null;
}
