export interface ChatClipRef {
    channel: string;
    code: string;
}

const CHANNEL_RE = /^[A-Za-z0-9_-]{3,32}$/;
const CODE_RE = /^[A-Za-z][A-Za-z0-9]{5,47}$/;

function toRef(channel: string, code: string): ChatClipRef | null {
    if (!CHANNEL_RE.test(channel) || !CODE_RE.test(code)) return null;
    return { channel: channel.toLowerCase(), code };
}

export function parseChatClipUrl(raw: string, host: string): ChatClipRef | null {
    if (!host) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host.toLowerCase() !== host.toLowerCase()) return null;
    const parts = url.pathname.split("/").filter((part) => part.length > 0);
    if (parts.length === 4 && parts[0]!.toLowerCase() === "embed" && parts[1]!.toLowerCase() === "clip") {
        return toRef(parts[2]!, parts[3]!);
    }
    if (parts.length === 3 && parts[1]!.toLowerCase() === "clip" && parts[0]!.toLowerCase() !== "embed") {
        return toRef(parts[0]!, parts[2]!);
    }
    return null;
}

export function currentChatHost(): string {
    return typeof location !== "undefined" && typeof location.host === "string" ? location.host : "";
}
