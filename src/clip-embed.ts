import { parseClipEmbedRoute } from "./clip-embed/route.ts";
import { openLink, stateEl, video } from "./clip-embed/dom.ts";

interface ClipResponse {
    channel?: string;
    status?: string;
    url?: string | null;
    thumbnailUrl?: string | null;
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

async function boot(): Promise<void> {
    const route = parseClipEmbedRoute(location.pathname);
    if (!route) {
        renderState("Clip not found.");
        return;
    }

    openLink.href = `/${encodeURIComponent(route.channel)}/clip/${encodeURIComponent(route.code)}`;
    openLink.classList.remove("hidden");

    try {
        const res = await fetch(`/api/live/clips/${encodeURIComponent(route.code)}`);
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
            renderClip(data.url, typeof data.thumbnailUrl === "string" && data.thumbnailUrl ? data.thumbnailUrl : null);
            return;
        }
        renderState("Clip not available.");
    } catch {
        renderState("Clip not found.");
    }
}

void boot();

export {};
