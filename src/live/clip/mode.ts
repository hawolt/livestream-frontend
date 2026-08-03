import {
    categoryEl,
    categorySepEl,
    chatEl,
    clipWatchLiveEl,
    languageEl,
    languageSepEl,
    nameEl,
    page,
    posterEl,
    sepEl,
    titleBar,
    titleEl,
    video,
} from "../dom.ts";
import { fitChat } from "../layout.ts";
import {
    clipStatusPollingActive,
    fetchClipByCode,
    startClipStatusPolling,
    stopClipStatusPolling,
    type ClipStatusRecord,
} from "../../clip-status-poll.ts";
import { clipProcessingMessage } from "../../clip-processing-message.ts";
import type { ClipRoute } from "./route.ts";

function setClipPoster(text: string, isError = false): void {
    posterEl.textContent = text;
    posterEl.classList.toggle("error", isError);
    posterEl.classList.remove("loading");
    posterEl.classList.remove("hidden");
}

function clearClipPoster(): void {
    posterEl.classList.add("hidden");
    posterEl.textContent = "";
}

function applyChannelLiveState(live: boolean, channel: string): void {
    if (live) {
        clipWatchLiveEl.href = `/${encodeURIComponent(channel)}`;
        clipWatchLiveEl.hidden = false;
    } else {
        clipWatchLiveEl.hidden = true;
    }
}

async function loadChannelChrome(channel: string): Promise<void> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(channel)}`);
        if (!res.ok) {
            applyChannelLiveState(false, channel);
            return;
        }
        const info = await res.json() as { live?: boolean };
        applyChannelLiveState(info.live === true, channel);
    } catch {
        applyChannelLiveState(false, channel);
    }
}

function renderClipRecord(route: ClipRoute, clip: ClipStatusRecord): void {
    document.title = clip.title ? `${clip.title} - ${route.channel}` : route.channel;
    titleEl.textContent = clip.title;
    sepEl.classList.toggle("hidden", !clip.title);

    if (clip.status === "ready" && clip.url) {
        clearClipPoster();
        video.poster = clip.thumbnailUrl ?? "";
        if (video.getAttribute("src") !== clip.url) video.src = clip.url;
        video.controls = true;
        stopClipStatusPolling();
        return;
    }
    video.controls = false;
    video.removeAttribute("src");
    if (clip.status === "failed") {
        setClipPoster(clip.error ? `This clip failed to process: ${clip.error}` : "This clip failed to process.", true);
        stopClipStatusPolling();
    } else {
        setClipPoster(clipProcessingMessage(clip.phase, clip.queuePosition, "This clip is still processing."));
    }
}

function applyResult(route: ClipRoute, result: ClipStatusRecord | null | "not-found"): void {
    if (result === "not-found") {
        stopClipStatusPolling();
        document.title = route.channel;
        setClipPoster("This clip does not exist.", true);
        return;
    }
    if (result === null) {
        if (!clipStatusPollingActive()) setClipPoster("Could not load this clip. Try refreshing the page.", true);
        return;
    }
    if (result.channel && result.channel.toLowerCase() !== route.channel.toLowerCase()) {
        stopClipStatusPolling();
        document.title = route.channel;
        setClipPoster("This clip does not exist.", true);
        return;
    }
    renderClipRecord(route, result);
    if (result.status === "processing") {
        startClipStatusPolling(route.code, (next) => applyResult(route, next));
    } else {
        stopClipStatusPolling();
    }
}

let clipModeWired = false;

export async function bootClipMode(route: ClipRoute): Promise<void> {
    document.body.classList.add("clip-mode");
    page.hidden = false;
    titleBar.classList.remove("hidden");
    categoryEl.classList.add("hidden");
    categorySepEl.classList.add("hidden");
    languageEl.classList.add("hidden");
    languageSepEl.classList.add("hidden");
    chatEl.classList.add("collapsed");
    fitChat();

    video.removeAttribute("autoplay");
    video.removeAttribute("muted");
    video.muted = false;
    video.controls = false;

    nameEl.textContent = route.channel;
    if (!clipModeWired) {
        clipModeWired = true;
        nameEl.addEventListener("click", () => {
            location.href = `/${encodeURIComponent(route.channel)}`;
        });
    }
    document.title = route.channel;
    setClipPoster("Loading clip...");

    void loadChannelChrome(route.channel);

    const result = await fetchClipByCode(route.code);
    applyResult(route, result);
}
