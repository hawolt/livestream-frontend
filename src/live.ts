import { resumeChat, startChat, suspendChat } from "./live-chat.ts";
import { type LiveChannelInfo } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { reportVisit } from "./visit-beacon.ts";
import { setCaptchaAnchor, warmCaptcha } from "./captcha.ts";
import { startAdRotation } from "./ads.ts";
import {
    browseMiniUsername,
    btnChatToggle,
    btnLayoutToggle,
    chatFeatureSlotEl,
    chatEl,
    nameEl,
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
import { canUseNativeHLS } from "./live/player/hls.ts";
import { openLoginModal, wireLoginModal } from "./live/login-modal.ts";
import { initFollow } from "./live/follow.ts";
import { connectViewcount, enableWatchAuth, resumeViewcount, suspendViewcount } from "./live/stream-info.ts";
import { initPointsChip } from "./live/points.ts";
import { openProfileFromUser } from "./chat/panels.ts";
import { parseClipRoute } from "./live/clip/route.ts";
import { bootClipMode } from "./live/clip/mode.ts";
import { promptStreamPassword } from "./live/stream-pass-gate.ts";
import { applyChannelChrome } from "./live/channel-chrome.ts";
import { installRaidHandover } from "./live/raid-handover.ts";

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
        nameEl.textContent = "No channel";
        bootCompleted = true;
        enterTerminal("No channel");
        return;
    }
    nameEl.textContent = ctx.displayUsername;
    document.title = ctx.displayUsername;
    browseMiniUsername.textContent = ctx.displayUsername;
    if (!chatPopout) {
        startChannelRail();
        setCaptchaAnchor(chatEl);
        warmCaptcha();
        startAdRotation(chatFeatureSlotEl, "chat", () => document.body.classList.contains("is-vertical"));
    }

    let title = "";
    let category = "";
    let categoryId: number | null = null;
    let language = "und";
    let emoteTwitchId = "";
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
                nameEl.textContent = ctx.displayUsername;
                document.title = ctx.displayUsername;
                bootCompleted = true;
                enterTerminal("Banned");
                return;
            }
            nameEl.textContent = "No channel";
            bootCompleted = true;
            enterTerminal("No channel");
            return;
        }
        if (res.ok) {
            let info = await res.json() as Partial<LiveChannelInfo>;
            if (!isCurrentBoot(generation, request)) return;
            if (info.locked === true) {
                if (typeof info.username === "string" && info.username) {
                    ctx.displayUsername = info.username;
                    nameEl.textContent = ctx.displayUsername;
                    document.title = ctx.displayUsername;
                }
                const unlocked = await promptStreamPassword(ctx.username, request.signal, {
                    passwordRequired: info.passwordRequired === true,
                    ticketRequired: info.ticketRequired === true,
                    ticketPriceCents: info.ticketPriceCents ?? null,
                    ticketCurrency: info.ticketCurrency ?? null,
                });
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
            ctx.clipsDisabled = info.passwordRequired === true || info.ticketRequired === true;
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
        }
    } catch {
        if (!isCurrentBoot(generation, request)) return;
    } finally {
        if (bootRequest === request) bootRequest = null;
    }
    if (generation !== bootGeneration) return;
    nameEl.textContent = ctx.displayUsername;
    document.title = ctx.displayUsername;
    browseMiniUsername.textContent = ctx.displayUsername;
    if (!chatPopout) {
        void loadProfile(ctx.username).then(profile => {
            if (profile && generation === bootGeneration) setOfflineArt(offlineArtUrl(profile));
        });
    }
    applyChannelChrome({ title, category, categoryId, language });

    wireLoginModal();
    startChat(ctx.username, emoteTwitchId, () => openLoginModal("chat"));

    if (chatPopout) {
        document.title = `${ctx.displayUsername} - chat`;
        bootCompleted = true;
        return;
    }

    void initFollow();
    enableWatchAuth();
    initPointsChip(ctx.username);
    connectViewcount();
    nameEl.addEventListener("click", () => openProfileFromUser());

    if (typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function") {
        titleBar.classList.remove("hidden");
        ctx.transportKind = "ws";
    } else if (canUseNativeHLS()) {
        titleBar.classList.remove("hidden");
        ctx.transportKind = "hls";
    } else {
        bootCompleted = true;
        enterTerminal("Playback not supported");
        return;
    }
    beginTransport();
    bootCompleted = true;
}

void boot();

export {};
