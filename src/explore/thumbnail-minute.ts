export function thumbnailMinute(now = Date.now()): number {
    return Math.floor(now / 60_000);
}
