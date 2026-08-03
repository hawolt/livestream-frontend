export interface ClipRoute {
    channel: string;
    code: string;
}

export function parseClipRoute(pathname: string): ClipRoute | null {
    const match = pathname.match(/^\/([a-z0-9_-]{3,32})\/clip\/([A-Za-z][A-Za-z0-9]{5,47})\/?$/);
    if (!match) return null;
    return { channel: match[1]!, code: match[2]! };
}
