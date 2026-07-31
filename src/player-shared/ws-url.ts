export function mediaWsUrl(mediaBase: string, path: string, fallbackOrigin: string): string {
    if (mediaBase) return mediaBase.replace(/^http/, "ws") + path;
    return `${fallbackOrigin}${path}`;
}
