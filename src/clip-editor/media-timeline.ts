export function mediaMsFromCurrentTime(currentTimeSec: number, mediaOffsetMs: number): number {
    return mediaOffsetMs + currentTimeSec * 1000;
}

export function currentTimeFromMediaMs(mediaMs: number, mediaOffsetMs: number): number {
    return (mediaMs - mediaOffsetMs) / 1000;
}
