import { ctx } from "./context.ts";
import { render } from "./render.ts";
import { parseExploreData } from "./response.ts";

const EXPLORE_POLL_MS = 10000;

let pollTimer: number | null = null;
let pollLoading = false;
let pollReloadRequested = false;
let pollWasVisible = false;

export async function loadExplore(): Promise<void> {
    try {
        const res = await fetch("/api/live/explore");
        if (!res.ok) return;
        const raw = await res.json();
        const hadData = ctx.streams.length > 0 || ctx.categories.length > 0;
        try {
            const data = parseExploreData(raw);
            ctx.streams = data.streams;
            ctx.categories = data.categories;
            if (typeof data.mediaBase === "string") ctx.mediaBase = data.mediaBase.replace(/\/+$/, "");
        } catch {
            if (hadData) return;
        }
        render();
    } catch {}
}

function explorePollVisible(): boolean {
    return document.visibilityState === "visible";
}

async function pollExplore(): Promise<void> {
    if (pollLoading) {
        pollReloadRequested = true;
        return;
    }
    if (!explorePollVisible()) return;
    pollLoading = true;
    try {
        await loadExplore();
    } finally {
        pollLoading = false;
        if (pollReloadRequested) {
            pollReloadRequested = false;
            void pollExplore();
        }
    }
}

function onExploreVisibilityChange(): void {
    const visible = explorePollVisible();
    const becameVisible = visible && !pollWasVisible;
    pollWasVisible = visible;
    if (becameVisible) void pollExplore();
}

export function startExplorePolling(): void {
    if (pollTimer !== null) return;
    pollWasVisible = explorePollVisible();
    document.addEventListener("visibilitychange", onExploreVisibilityChange);
    pollTimer = window.setInterval(() => void pollExplore(), EXPLORE_POLL_MS);
}

export function stopExplorePolling(): void {
    if (pollTimer === null) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onExploreVisibilityChange);
}

window.addEventListener("pagehide", () => stopExplorePolling());
