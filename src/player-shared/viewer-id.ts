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
