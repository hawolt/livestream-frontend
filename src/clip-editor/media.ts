import Hls from "hls.js";

export interface PinMediaHeaders {
    nowMs: number;
    windowMs: number;
    mediaStartMs: number;
}

export function parsePinMediaHeaders(headers: Headers): PinMediaHeaders | null {
    const nowMs = Number(headers.get("X-Now-Ms"));
    const windowMs = Number(headers.get("X-Window-Ms"));
    const mediaStartMs = Number(headers.get("X-Media-Start-Ms"));
    if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || !Number.isFinite(mediaStartMs)) return null;
    return { nowMs, windowMs, mediaStartMs };
}

const BACK_BUFFER_LENGTH_S = 60;

export function clipPlaylistUrl(channel: string, pin: string): string {
    return `/api/main/v1/clips/pin/hls?channel=${encodeURIComponent(channel)}&pin=${encodeURIComponent(pin)}`;
}

export async function fetchPinMediaHeaders(url: string, token: string): Promise<PinMediaHeaders | null> {
    try {
        const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
        if (!res.ok) return null;
        return parsePinMediaHeaders(res.headers);
    } catch {
        return null;
    }
}

export function createClipHls(token: string): Hls {
    return new Hls({
        lowLatencyMode: false,
        backBufferLength: BACK_BUFFER_LENGTH_S,
        xhrSetup: (xhr) => {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        },
    });
}
