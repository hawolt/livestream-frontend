export function parseClipIdFromPath(pathname: string): string | null {
    const segments = pathname.split("/").filter(Boolean);
    const id = segments[1] ?? "";
    return /^[0-9a-f]{16}$/.test(id) ? id : null;
}
