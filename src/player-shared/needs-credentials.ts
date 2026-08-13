export function needsCredentials(requestUrl: string, mediaBase: string, pageOrigin: string): boolean {
    const base = mediaBase || pageOrigin;
    try {
        const reqOrigin = new URL(requestUrl, pageOrigin).origin;
        const baseOrigin = new URL(base, pageOrigin).origin;
        return reqOrigin === baseOrigin;
    } catch {
        return false;
    }
}
