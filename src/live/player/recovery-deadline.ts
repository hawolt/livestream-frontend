export function recoveryDeadlineMs(watchdogMs: number, stallGraceMs: number): number {
    return Math.max(watchdogMs, stallGraceMs);
}
