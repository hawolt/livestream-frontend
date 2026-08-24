import { parseClipEmbedRoute } from "./clip-embed/route.ts";
import { openLink, stageEl, stateEl, video, watchLiveLink } from "./clip-embed/dom.ts";
import { wireChromeVisibility } from "./clip-embed/chrome.ts";
import { wireWatchBeacon } from "./live/watch-beacon.ts";
import { matureAccess } from "./mature-decision.ts";
import { confirmMatureViewer, matureConfirmed, viewerAge } from "./mature.ts";
import { promptEmbedMatureGate } from "./player-shared/mature-gate.ts";
import { MATURE_BLOCKED_MESSAGE, MATURE_GATE_MESSAGE } from "./mature-messages.ts";

interface ChannelResponse {
    live?: boolean;
}

interface ClipResponse {
    channel?: string;
    status?: string;
    url?: string | null;
    thumbnailUrl?: string | null;
    mature?: boolean;
}

function renderState(message: string): void {
    video.classList.add("hidden");
    video.removeAttribute("src");
    stateEl.textContent = message;
    stateEl.classList.remove("hidden");
}

function renderClip(url: string, thumbnailUrl: string | null): void {
    stateEl.classList.add("hidden");
    stateEl.textContent = "";
    if (thumbnailUrl) video.poster = thumbnailUrl;
    video.muted = true;
    video.src = url;
    video.classList.remove("hidden");
    video.play().catch(() => {});
}

async function showWatchLiveIfChannelIsLive(channel: string): Promise<void> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(channel)}`);
        if (!res.ok) return;
        const info = await res.json() as ChannelResponse;
        if (info.live !== true) return;
        watchLiveLink.href = `/${encodeURIComponent(channel)}`;
        watchLiveLink.classList.remove("hidden");
    } catch {
    }
}

async function boot(): Promise<void> {
    const route = parseClipEmbedRoute(location.pathname);
    if (!route) {
        renderState("Clip not found.");
        return;
    }

    wireChromeVisibility();
    wireWatchBeacon(video, "embed", () => route.channel);
    openLink.href = `/${encodeURIComponent(route.channel)}/clip/${encodeURIComponent(route.code)}`;
    openLink.classList.remove("hidden");

    try {
        const res = await fetch(`/api/live/clips/${encodeURIComponent(route.code)}`);
        if (res.status === 403) {
            renderState(MATURE_BLOCKED_MESSAGE);
            return;
        }
        if (!res.ok) {
            renderState("Clip not found.");
            return;
        }
        const data = await res.json() as ClipResponse;
        const channel = typeof data.channel === "string" ? data.channel : "";
        if (channel.toLowerCase() !== route.channel.toLowerCase()) {
            renderState("Clip not found.");
            return;
        }
        if (data.status === "ready" && typeof data.url === "string" && data.url) {
            if (!await matureViewerAllowed(data.mature === true, channel)) return;
            renderClip(data.url, typeof data.thumbnailUrl === "string" && data.thumbnailUrl ? data.thumbnailUrl : null);
            void showWatchLiveIfChannelIsLive(route.channel);
            return;
        }
        renderState("Clip not available.");
    } catch {
        renderState("Clip not found.");
    }
}

async function matureViewerAllowed(mature: boolean, channel: string): Promise<boolean> {
    if (!mature) return true;
    const access = matureAccess(true, await viewerAge(), matureConfirmed());
    if (access === "locked") {
        renderState(MATURE_BLOCKED_MESSAGE);
        return false;
    }
    if (access === "play") return true;
    renderState(MATURE_GATE_MESSAGE);
    if (!await promptEmbedMatureGate(stageEl, channel)) return false;
    confirmMatureViewer();
    return true;
}

void boot();

export {};
