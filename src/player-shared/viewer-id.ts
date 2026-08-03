import { readLocalStorage, writeLocalStorage } from "../storage.ts";

export const VIEWER_ID_KEY = "live_hid";

let viewerId = "";

export function getViewerId(): string {
    if (viewerId) return viewerId;
    const stored = readLocalStorage(VIEWER_ID_KEY);
    if (stored && /^[0-9a-f]{16}$/.test(stored)) {
        viewerId = stored;
        return viewerId;
    }
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    viewerId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocalStorage(VIEWER_ID_KEY, viewerId);
    return viewerId;
}

const SIGNED_VIEWER_ID = /^[0-9a-f]{16}\.[0-9a-f]{64}$/;

let signedViewerId = "";
let signedViewerIdPending: Promise<string> | null = null;

export function ensureViewerId(mediaBase: string, username: string): Promise<string> {
    if (signedViewerId) return Promise.resolve(signedViewerId);
    if (signedViewerIdPending) return signedViewerIdPending;
    const url = `${mediaBase}/hls/${encodeURIComponent(username)}/vid`;
    signedViewerIdPending = fetch(url, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { id?: string } | null) => {
            const minted = body?.id ?? "";
            if (SIGNED_VIEWER_ID.test(minted)) signedViewerId = minted;
            return signedViewerId || getViewerId();
        })
        .catch(() => getViewerId())
        .finally(() => {
            signedViewerIdPending = null;
        });
    return signedViewerIdPending;
}
