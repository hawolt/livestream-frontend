export const PING_THROTTLE_MS = 3000;

export function canPing(lastPingAt: number | null, now: number, throttleMs: number = PING_THROTTLE_MS): boolean {
    if (lastPingAt === null) return true;
    return now - lastPingAt >= throttleMs;
}
