function hasControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

export function safeNotificationHref(raw: string | null | undefined): string | null {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!value || hasControlCharacter(value)) return null;
    if (value.includes("\\")) return null;
    if (value.startsWith("//")) return null;
    if (value.startsWith("/")) return value;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return value;
}
