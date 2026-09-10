export function toWsOrigin(mediaBase: string, pageProtocol: string): string {
    if (/^wss?:\/\//.test(mediaBase)) return mediaBase;
    if (mediaBase.startsWith("//")) {
        const wsProtocol = pageProtocol === "https:" ? "wss:" : "ws:";
        return `${wsProtocol}${mediaBase}`;
    }
    if (/^https?:\/\//.test(mediaBase)) return mediaBase.replace(/^http/, "ws");
    return mediaBase;
}
