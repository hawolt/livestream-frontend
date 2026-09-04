export const STARTUP_RUNWAY_S = 2.5;
export const STARTUP_HOLD_MAX_MS = 5000;

export function bufferedAheadOf(ranges: Array<{ start: number; end: number }>, position: number): number {
    for (const range of ranges) {
        if (position >= range.start - 0.5 && position <= range.end) return range.end - position;
    }
    const last = ranges[ranges.length - 1];
    return last ? Math.max(0, last.end - position) : 0;
}

export function startupHoldOver(aheadS: number, heldMs: number, runwayS = STARTUP_RUNWAY_S): boolean {
    return aheadS >= runwayS || heldMs >= STARTUP_HOLD_MAX_MS;
}
