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
let signedFor = "";
let signedViewerIdPending: Promise<string> | null = null;
let pendingFor = "";

export function resetSignedViewerId(): void {
    signedViewerId = "";
    signedFor = "";
}

export function ensureViewerId(mediaBase: string, username: string): Promise<string> {
    if (signedViewerId && signedFor === mediaBase) return Promise.resolve(signedViewerId);
    if (signedViewerIdPending && pendingFor === mediaBase) return signedViewerIdPending;
    const url = `${mediaBase}/hls/${encodeURIComponent(username)}/vid`;
    pendingFor = mediaBase;
    const pending = fetch(url, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { id?: string } | null) => {
            const minted = body?.id ?? "";
            if (SIGNED_VIEWER_ID.test(minted)) {
                signedViewerId = minted;
                signedFor = mediaBase;
            }
            return signedFor === mediaBase && signedViewerId ? signedViewerId : getViewerId();
        })
        .catch(() => getViewerId())
        .finally(() => {
            if (signedViewerIdPending === pending) signedViewerIdPending = null;
        });
    signedViewerIdPending = pending;
    return pending;
}
