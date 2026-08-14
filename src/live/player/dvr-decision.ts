export interface BufferedRange {
    start: number;
    end: number;
}

export function activeBufferedRange(ranges: BufferedRange[], currentTime: number): BufferedRange | null {
    if (!ranges.length) return null;
    for (const range of ranges) {
        if (currentTime >= range.start && currentTime <= range.end) return range;
    }
    return ranges[ranges.length - 1];
}

export function clampToRange(pos: number, range: BufferedRange): number {
    return Math.min(range.end, Math.max(range.start, pos));
}

export function dvrAvailable(range: BufferedRange | null, minSpanS: number): boolean {
    return range !== null && range.end - range.start >= minSpanS;
}

export function resolveLiveEdge(liveSyncPosition: number | null, fallbackEnd: number): number {
    return liveSyncPosition !== null && liveSyncPosition > 0 ? liveSyncPosition : fallbackEnd;
}

export function behindSeconds(liveEdge: number, position: number): number {
    return Math.max(0, liveEdge - position);
}

export function isBehindLive(behind: number, snapThresholdS: number): boolean {
    return behind > snapThresholdS;
}
