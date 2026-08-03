export interface ClipEmbedRoute {
    channel: string;
    code: string;
}

export function parseClipEmbedRoute(pathname: string): ClipEmbedRoute | null {
    const match = pathname.match(/^\/embed\/clip\/([a-z0-9_-]{3,32})\/([A-Za-z][A-Za-z0-9]{5,47})\/?$/);
    if (!match) return null;
    return { channel: match[1]!, code: match[2]! };
}
