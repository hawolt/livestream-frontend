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

const CANDIDATE_MIME_TYPES = [
    'video/mp4; codecs="avc1.640028,mp4a.40.2"',
    'video/mp4; codecs="avc1.4d401f,mp4a.40.2"',
    'video/mp4; codecs="avc1.42e01e,mp4a.40.2"',
    "video/mp4",
];

export function pickSupportedMimeType(): string | null {
    if (typeof MediaSource === "undefined" || typeof MediaSource.isTypeSupported !== "function") return null;
    for (const mime of CANDIDATE_MIME_TYPES) {
        if (MediaSource.isTypeSupported(mime)) return mime;
    }
    return null;
}

function appendChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
        const onUpdateEnd = () => {
            sourceBuffer.removeEventListener("updateend", onUpdateEnd);
            sourceBuffer.removeEventListener("error", onError);
            resolve();
        };
        const onError = () => {
            sourceBuffer.removeEventListener("updateend", onUpdateEnd);
            sourceBuffer.removeEventListener("error", onError);
            reject(new Error("append failed"));
        };
        sourceBuffer.addEventListener("updateend", onUpdateEnd);
        sourceBuffer.addEventListener("error", onError);
        try {
            sourceBuffer.appendBuffer(chunk as BufferSource);
        } catch (e) {
            sourceBuffer.removeEventListener("updateend", onUpdateEnd);
            sourceBuffer.removeEventListener("error", onError);
            reject(e);
        }
    });
}

function bufferedFraction(sourceBuffer: SourceBuffer, headers: PinMediaHeaders): number {
    if (headers.windowMs <= 0) return 0;
    try {
        const buffered = sourceBuffer.buffered;
        if (!buffered.length) return 0;
        const endMs = buffered.end(buffered.length - 1) * 1000;
        const loadedMs = endMs - headers.mediaStartMs;
        return Math.min(1, Math.max(0, loadedMs / headers.windowMs));
    } catch {
        return 0;
    }
}

export type MediaProgressCallback = (loadedFraction: number, headers: PinMediaHeaders) => void;

export async function streamPinMedia(
    channel: string,
    pin: string,
    sourceBuffer: SourceBuffer,
    onProgress: MediaProgressCallback,
    isCancelled: () => boolean,
): Promise<PinMediaHeaders | null> {
    const res = await fetch(`/api/main/v1/clips/pin/media?channel=${encodeURIComponent(channel)}&pin=${encodeURIComponent(pin)}`);
    if (!res.ok || !res.body) return null;
    const headers = parsePinMediaHeaders(res.headers);
    if (!headers) return null;
    const reader = res.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (isCancelled()) {
            void reader.cancel().catch(() => {});
            return headers;
        }
        if (done) break;
        if (value && value.byteLength) {
            await appendChunk(sourceBuffer, value);
            if (isCancelled()) return headers;
            onProgress(bufferedFraction(sourceBuffer, headers), headers);
        }
    }
    onProgress(1, headers);
    return headers;
}
