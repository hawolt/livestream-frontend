export function parseChannelParam(search: string): string | null {
    const params = new URLSearchParams(search);
    const raw = (params.get("channel") ?? "").toLowerCase();
    return /^[a-z0-9_-]{3,32}$/.test(raw) ? raw : null;
}
