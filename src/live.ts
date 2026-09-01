import { resumeChat, startChat, suspendChat } from "./live-chat.ts";
import { type LiveChannelInfo } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { reportVisit } from "./visit-beacon.ts";
import { getCaptchaToken, warmCaptcha } from "./captcha.ts";
import { startAdRotation } from "./ads.ts";
import { matureAccess } from "./mature-decision.ts";
import { confirmMatureViewer, matureConfirmed, viewerAge } from "./mature.ts";
import { promptMatureGate } from "./live/mature-gate.ts";
import { MATURE_BLOCKED_MESSAGE, MATURE_GATE_MESSAGE } from "./mature-messages.ts";
import {
    browseMiniUsername,
    btnChatToggle,
    btnLayoutToggle,
    chatFeatureSlotEl,
    partnerBadgeEl,
    page,
    titleBar,
    viewersHeaderEl,
} from "./live/dom.ts";
import { ctx } from "./live/player/context.ts";
import { wireChatOverflow, wireControls } from "./live/controls.ts";
import { startChannelRail } from "./live/channel-rail.ts";
import { syncLayout } from "./live/layout.ts";
import { beginTransport, enterTerminal, setOfflineArt } from "./live/player/lifecycle.ts";
import { loadProfile, offlineArtUrl } from "./profile-card.ts";
import { initOwnerCards, loadAboutClips, loadStreamActivity, mountAboutCard } from "./live/about.ts";
import { canUseHlsJs, canUseNativeHLS, mseSupported } from "./live/player/hls-support.ts";
import { openLoginModal, wireLoginModal } from "./live/login-modal.ts";
import { initFollow } from "./live/follow.ts";
import { connectViewcount, enableWatchAuth, resumeViewcount, setStreamStart, suspendViewcount } from "./live/stream-info.ts";
import { initPointsChip } from "./live/points.ts";
import { parseClipRoute } from "./live/clip/route.ts";
import { bootClipMode } from "./live/clip/mode.ts";
import { promptStreamPassword } from "./live/stream-pass-gate.ts";
import { applyChannelChrome, setChannelName } from "./live/channel-chrome.ts";
import { initStreamInfoEdit } from "./live/stream-info-edit.ts";
import { channelPageTitle, chatPopoutTitle } from "./live/page-title.ts";
import { installRaidHandover } from "./live/raid-handover.ts";
import { parseViewerClaim } from "./player-shared/viewer-claim.ts";
import { chooseTransport } from "./player-shared/transport-choice.ts";
import { readLocalStorage } from "./storage.ts";
import { TRANSPORT_STORAGE_KEY } from "./live/constants.ts";

const chatPopout = new URLSearchParams(location.search).get("chat") === "popout";
reportVisit(parseClipRoute(location.pathname) ? "other" : "channel");
let bootGeneration = 0;
let bootRequest: AbortController | null = null;
let shellWired = false;
let bootCompleted = false;

function isCurrentBoot(generation: number, request: AbortController): boolean {
    return generation === bootGeneration && bootRequest === request && !request.signal.aborted;
}

window.addEventListener("pagehide", () => {
    bootGeneration += 1;
    bootRequest?.abort();
    bootRequest = null;
    suspendChat();
    if (!chatPopout) suspendViewcount();
});

window.addEventListener("pageshow", (event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    resumeChat();
    if (!chatPopout) resumeViewcount();
    if (!bootCompleted && !ctx.terminal) void boot();
});

async function boot(): Promise<void> {
    ++bootGeneration;
    bootCompleted = false;

    const clipRoute = parseClipRoute(location.pathname);
    if (clipRoute) {
        page.hidden = false;
        if (!shellWired) {
            shellWired = true;
            void initSiteNav(null);
        }
        await bootClipMode(clipRoute);
        bootCompleted = true;
        return;
    }

    const generation = bootGeneration;
    if (chatPopout) document.body.classList.add("chat-popout");

    page.hidden = false;
    if (!shellWired) {
        shellWired = true;
        if (chatPopout) {
            wireChatOverflow();
        } else {
            wireControls();
            syncLayout();
            installRaidHandover();
            void initSiteNav(null, [viewersHeaderEl, btnLayoutToggle, btnChatToggle]);
        }
    }

    const seg = location.pathname.split("/").filter(Boolean)[0] ?? "";
    ctx.username = seg.toLowerCase();
    ctx.displayUsername = ctx.username;
    if (!/^[a-z0-9_-]{3,32}$/.test(ctx.username)) {
        setChannelName("No channel", null);
        bootCompleted = true;
        enterTerminal("No channel");
        return;
    }
    setChannelName(ctx.displayUsername, ctx.username);
    let channelPartner = false;
    partnerBadgeEl.hidden = true;
    document.title = channelPageTitle(ctx.displayUsername);
    browseMiniUsername.textContent = ctx.displayUsername;
    if (!chatPopout) {
        startChannelRail();
        warmCaptcha();
        startAdRotation(chatFeatureSlotEl, "chat", {
            channel: ctx.username,
            skip: () => document.body.classList.contains("is-vertical"),
        });
    }

    let title = "";
    let category = "";
    let categoryId: number | null = null;
    let language = "und";
    let emoteTwitchId = "";
    let pointsName = "";
    let mature = false;
    const request = new AbortController();
    bootRequest?.abort();
    bootRequest = request;
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`, { signal: request.signal });
        if (!isCurrentBoot(generation, request)) return;
        if (res.status === 404) {
            let banned = false;
            try {
                const body = await res.json() as { banned?: boolean };
                if (!isCurrentBoot(generation, request)) return;
                banned = body.banned === true;
            } catch {}
            if (!isCurrentBoot(generation, request)) return;
            if (banned) {
                setChannelName(ctx.displayUsername, ctx.username);
                document.title = channelPageTitle(ctx.displayUsername);
                bootCompleted = true;
                enterTerminal("Banned");
                return;
            }
            setChannelName("No channel", null);
            bootCompleted = true;
            enterTerminal("No channel");
            return;
        }
        if (res.status === 403) {
            bootCompleted = true;
            enterTerminal(MATURE_BLOCKED_MESSAGE);
            return;
        }
        if (res.ok) {
            let info = await res.json() as Partial<LiveChannelInfo>;
            if (!isCurrentBoot(generation, request)) return;
            if (info.locked === true) {
                if (typeof info.username === "string" && info.username) {
                    ctx.displayUsername = info.username;
                    setChannelName(ctx.displayUsername, ctx.username);
                    document.title = channelPageTitle(ctx.displayUsername);
                }
                const unlocked = await promptStreamPassword(ctx.username, request.signal);
                if (!unlocked || !isCurrentBoot(generation, request)) return;
                const retry = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`, { signal: request.signal });
                if (!isCurrentBoot(generation, request)) return;
                if (!retry.ok) {
                    bootCompleted = true;
                    enterTerminal("No channel");
                    return;
                }
                info = await retry.json() as Partial<LiveChannelInfo>;
                if (!isCurrentBoot(generation, request)) return;
                if (info.locked === true) {
                    bootCompleted = true;
                    enterTerminal("Private stream");
                    return;
                }
            }
            ctx.clipsDisabled = info.passwordRequired === true;
            channelPartner = info.partner === true;
            if (typeof info.username === "string" && info.username) {
                ctx.displayUsername = info.username;
            }
            if (typeof info.title === "string") {
                title = info.title;
            }
            if (typeof info.category === "string" && info.category) {
                category = info.category;
            }
            if (typeof info.categoryId === "number") {
                categoryId = info.categoryId;
            }
            if (typeof info.language === "string") {
                language = info.language;
            }
            if (typeof info.mediaBase === "string") {
                ctx.mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
            ctx.wssBase = typeof info.wssBase === "string" ? info.wssBase.replace(/\/+$/, "") : "";
            if (typeof info.emoteTwitchId === "string") {
                emoteTwitchId = info.emoteTwitchId;
            }
            if (typeof info.pointsName === "string") {
                pointsName = info.pointsName;
            }
            if (typeof info.startedAt === "number" && info.startedAt > 0) {
                setStreamStart(info.startedAt);
            }
            mature = info.mature === true;
        }
    } catch {
        if (!isCurrentBoot(generation, request)) return;
    } finally {
        if (bootRequest === request) bootRequest = null;
    }
    if (generation !== bootGeneration) return;
    setChannelName(ctx.displayUsername, ctx.username);
    partnerBadgeEl.hidden = channelPartner !== true;
    document.title = channelPageTitle(ctx.displayUsername, title);
    browseMiniUsername.textContent = ctx.displayUsername;
    if (mature) {
        const access = matureAccess(true, await viewerAge(), matureConfirmed());
        if (generation !== bootGeneration) return;
        if (access === "locked") {
            bootCompleted = true;
            enterTerminal(MATURE_BLOCKED_MESSAGE);
            return;
        }
        if (access === "confirm") {
            const allowed = await promptMatureGate(ctx.displayUsername, request.signal);
            if (generation !== bootGeneration) return;
            if (!allowed) {
                bootCompleted = true;
                enterTerminal(MATURE_GATE_MESSAGE);
                return;
            }
            confirmMatureViewer();
        }
    }
    if (!chatPopout) {
        void loadProfile(ctx.username).then(profile => {
            if (generation !== bootGeneration) return;
            if (profile) setOfflineArt(offlineArtUrl(profile));
            mountAboutCard(profile);
        });
        loadAboutClips(ctx.username);
        loadStreamActivity(ctx.username);
        initOwnerCards(ctx.username);
        initStreamInfoEdit(ctx.username, { title, category, categoryId, language });
    }
    applyChannelChrome({ title, category, categoryId, language });

    wireLoginModal();
    startChat(ctx.username, emoteTwitchId, () => openLoginModal("chat"));

    if (chatPopout) {
        document.title = chatPopoutTitle(ctx.displayUsername);
        bootCompleted = true;
        return;
    }

    void initFollow();
    enableWatchAuth();
    initPointsChip(ctx.username, pointsName);
    connectViewcount();

    const captchaToken = await getCaptchaToken();
    if (generation !== bootGeneration) return;
    const { lowLatency } = parseViewerClaim(captchaToken || null);
    const transport = chooseTransport({
        mseSupported: mseSupported(),
        nativeHls: canUseNativeHLS(),
        hlsJsSupported: canUseHlsJs(),
        lowLatency,
        llDenied: ctx.llDenied,
        override: readLocalStorage(TRANSPORT_STORAGE_KEY),
    });
    if (transport === "unsupported") {
        bootCompleted = true;
        enterTerminal("Playback not supported");
        return;
    }
    titleBar.classList.remove("hidden");
    ctx.transportKind = transport;
    beginTransport();
    bootCompleted = true;
}

void boot();

export {};
