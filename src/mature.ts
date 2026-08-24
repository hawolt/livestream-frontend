import { API_BASE } from "./api.ts";
import { viewerAgeFor, type ViewerAge } from "./mature-decision.ts";

let agePromise: Promise<ViewerAge> | null = null;
let confirmed = false;

export function matureConfirmed(): boolean {
    return confirmed;
}

export function confirmMatureViewer(): void {
    confirmed = true;
}

async function resolveViewerAge(): Promise<ViewerAge> {
    try {
        const res = await fetch(`${API_BASE}/auth/terms`, { credentials: "include" });
        if (!res.ok) return "unknown";
        const body = await res.json() as { birthYear?: unknown };
        return viewerAgeFor(body.birthYear, new Date().getFullYear());
    } catch {
        return "unknown";
    }
}

export function viewerAge(): Promise<ViewerAge> {
    if (!agePromise) agePromise = resolveViewerAge();
    return agePromise;
}
