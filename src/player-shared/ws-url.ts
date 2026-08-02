export function toWsOrigin(mediaBase: string, pageProtocol: string): string {
    if (/^wss?:\/\//.test(mediaBase)) return mediaBase;
    if (mediaBase.startsWith("//")) {
        const wsProtocol = pageProtocol === "https:" ? "wss:" : "ws:";
        return `${wsProtocol}${mediaBase}`;
    }
    if (/^https?:\/\//.test(mediaBase)) return mediaBase.replace(/^http/, "ws");
    return mediaBase;
}

export function mediaWsUrl(mediaBase: string, path: string, fallbackOrigin: string, pageProtocol = "https:"): string {
    if (mediaBase) return toWsOrigin(mediaBase, pageProtocol) + path;
    return `${fallbackOrigin}${path}`;
}
