export function buildThumbUrl(username: string, streamMediaBase: string | undefined, fallbackMediaBase: string, cacheKeyMinute: number, customThumbnail?: string): string {
    if (customThumbnail) return customThumbnail;
    const base = (typeof streamMediaBase === "string" ? streamMediaBase : fallbackMediaBase).replace(/\/+$/, "");
    return `${base}/thumb/${encodeURIComponent(username.toLowerCase())}.jpg?t=${cacheKeyMinute}`;
}
