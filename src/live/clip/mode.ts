import {
    chatFeatureSlotEl,
    clipWatchLiveEl,
    nameEl,
    page,
    posterEl,
    titleBar,
    video,
} from "../dom.ts";
import { applyChannelChrome } from "../channel-chrome.ts";
import { initOwnerCards, loadAboutClips, mountAboutCard } from "../about.ts";
import { syncLayout } from "../layout.ts";
import {
    clipStatusPollingActive,
    fetchClipByCode,
    startClipStatusPolling,
    stopClipStatusPolling,
    type ClipStatusRecord,
} from "../../clip-status-poll.ts";
import { clipProcessingMessage } from "../../clip-processing-message.ts";
import type { ClipRoute } from "./route.ts";
import { ctx } from "../player/context.ts";
import type { LiveChannelInfo } from "../../api.ts";
import { startAdRotation } from "../../ads.ts";
import { warmCaptcha } from "../../captcha.ts";
import { startChat } from "../../live-chat.ts";
import { openLoginModal, wireLoginModal } from "../login-modal.ts";
import { initFollow } from "../follow.ts";
import { connectViewcount } from "../stream-info.ts";
import { startChannelRail } from "../channel-rail.ts";
import { loadProfile, offlineArtUrl } from "../../profile-card.ts";
import { attemptClipAutoplay, hideClipControls, showClipControls, wireClipPlayer, wireClipUnmute } from "./player.ts";

interface ChannelChrome {
    category: string;
    categoryId: number | null;
    language: string;
    emoteTwitchId: string;
    displayUsername: string;
    live: boolean;
}

const EMPTY_CHROME: ChannelChrome = {
    category: "",
    categoryId: null,
    language: "und",
    emoteTwitchId: "",
    displayUsername: "",
    live: false,
};

let channelChrome: ChannelChrome = EMPTY_CHROME;
let clipTitle = "";
let clipArtUrl: string | null = null;

function applyClipArt(on: boolean): void {
    if (on && clipArtUrl) {
        const safe = clipArtUrl.replace(/"/g, "%22");
        posterEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url("${safe}")`;
        posterEl.classList.add("has-art");
        return;
    }
    posterEl.style.removeProperty("background-image");
    posterEl.classList.remove("has-art");
}

function setClipPoster(text: string, isError = false): void {
    posterEl.textContent = text;
    posterEl.classList.toggle("error", isError);
    posterEl.classList.remove("loading");
    posterEl.classList.remove("hidden");
    applyClipArt(true);
    hideClipControls();
}

function clearClipPoster(): void {
    posterEl.classList.add("hidden");
    posterEl.textContent = "";
    applyClipArt(false);
}

function applyChannelLiveState(): void {
    if (channelChrome.live) {
        clipWatchLiveEl.href = `/${encodeURIComponent(ctx.username)}`;
        clipWatchLiveEl.hidden = false;
    } else {
        clipWatchLiveEl.hidden = true;
    }
}

function renderInfoBar(): void {
    applyChannelChrome({
        title: clipTitle,
        category: channelChrome.category,
        categoryId: channelChrome.categoryId,
        language: channelChrome.language,
    });
}

async function fetchChannelChrome(channel: string): Promise<ChannelChrome> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(channel)}`);
        if (!res.ok) return EMPTY_CHROME;
        const info = await res.json() as Partial<LiveChannelInfo> & { live?: boolean };
        return {
            category: typeof info.category === "string" && info.category ? info.category : "",
            categoryId: typeof info.categoryId === "number" ? info.categoryId : null,
            language: typeof info.language === "string" ? info.language : "und",
            emoteTwitchId: typeof info.emoteTwitchId === "string" ? info.emoteTwitchId : "",
            displayUsername: typeof info.username === "string" && info.username ? info.username : channel,
            live: info.live === true,
        };
    } catch {
        return EMPTY_CHROME;
    }
}

function renderClipRecord(route: ClipRoute, clip: ClipStatusRecord): void {
    clipTitle = clip.title;
    document.title = clip.title ? `${clip.title} - ${route.channel}` : route.channel;
    renderInfoBar();

    if (clip.status === "ready" && clip.url) {
        clearClipPoster();
        video.poster = clip.thumbnailUrl ?? "";
        if (video.getAttribute("src") !== clip.url) video.src = clip.url;
        showClipControls();
        stopClipStatusPolling();
        attemptClipAutoplay();
        return;
    }
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
        clipTitle = "";
        document.title = route.channel;
        renderInfoBar();
        setClipPoster("This clip does not exist.", true);
        return;
    }
    if (result === null) {
        if (!clipStatusPollingActive()) setClipPoster("Could not load this clip. Try refreshing the page.", true);
        return;
    }
    if (result.channel && result.channel.toLowerCase() !== route.channel.toLowerCase()) {
        stopClipStatusPolling();
        clipTitle = "";
        document.title = route.channel;
        renderInfoBar();
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

export async function bootClipMode(route: ClipRoute): Promise<void> {
    document.body.classList.add("clip-mode");
    page.hidden = false;
    titleBar.classList.remove("hidden");

    ctx.username = route.channel;
    ctx.displayUsername = route.channel;

    video.removeAttribute("autoplay");
    video.removeAttribute("muted");
    video.muted = false;
    video.controls = false;

    nameEl.textContent = route.channel;
    document.title = route.channel;
    setClipPoster("Loading clip...");

    wireClipPlayer();
    wireClipUnmute();
    syncLayout();

    startChannelRail();
    warmCaptcha();
    startAdRotation(chatFeatureSlotEl, "chat");
    void loadProfile(route.channel).then(profile => {
        if (profile) clipArtUrl = offlineArtUrl(profile);
        if (!posterEl.classList.contains("hidden")) applyClipArt(true);
        mountAboutCard(profile);
    });
    loadAboutClips(route.channel);
    initOwnerCards(route.channel);

    const [chromeResult, clipResult] = await Promise.all([
        fetchChannelChrome(route.channel),
        fetchClipByCode(route.code),
    ]);

    channelChrome = chromeResult;
    if (channelChrome.displayUsername) {
        ctx.displayUsername = channelChrome.displayUsername;
        nameEl.textContent = channelChrome.displayUsername;
    }
    applyChannelLiveState();
    renderInfoBar();

    wireLoginModal();
    startChat(route.channel, channelChrome.emoteTwitchId, () => openLoginModal("chat"));

    void initFollow();
    connectViewcount();

    applyResult(route, clipResult);
}
