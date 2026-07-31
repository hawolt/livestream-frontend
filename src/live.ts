import { startChat } from "./live-chat";
import { type LiveChannelInfo } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { setCaptchaAnchor, warmCaptcha } from "./captcha.ts";
import { streamLanguageLabel } from "./stream-languages.ts";
import {
    browseMiniUsername,
    btnChatToggle,
    btnLayoutToggle,
    categoryEl,
    categorySepEl,
    chatEl,
    languageEl,
    languageSepEl,
    nameEl,
    page,
    sepEl,
    titleBar,
    titleEl,
    viewersHeaderEl,
} from "./live/dom.ts";
import { ctx } from "./live/player/context.ts";
import { wireControls } from "./live/controls.ts";
import { syncLayout } from "./live/layout.ts";
import { beginTransport, enterTerminal } from "./live/player/lifecycle.ts";
import { canUseNativeHLS } from "./live/player/hls.ts";
import { openLoginModal, wireLoginModal } from "./live/login-modal.ts";
import { initFollow } from "./live/follow.ts";
import { connectViewcount } from "./live/stream-info.ts";

async function boot(): Promise<void> {
    const chatPopout = new URLSearchParams(location.search).get("chat") === "popout";
    if (chatPopout) document.body.classList.add("chat-popout");

    page.hidden = false;
    wireControls();
    syncLayout();
    void initSiteNav(null, [viewersHeaderEl, btnLayoutToggle, btnChatToggle]);

    const seg = location.pathname.split("/").filter(Boolean)[0] ?? "";
    ctx.username = seg.toLowerCase();
    ctx.displayUsername = ctx.username;
    if (!/^[a-z0-9_-]{3,32}$/.test(ctx.username)) {
        nameEl.textContent = "No channel";
        enterTerminal("No channel");
        return;
    }
    nameEl.textContent = ctx.displayUsername;
    document.title = ctx.displayUsername;
    browseMiniUsername.textContent = ctx.displayUsername;
    if (!chatPopout) {
        setCaptchaAnchor(chatEl);
        warmCaptcha();
    }

    let title = "";
    let category = "";
    let categoryId: number | null = null;
    let language = "und";
    let emoteTwitchId = "";
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`);
        if (res.status === 404) {
            nameEl.textContent = "No channel";
            enterTerminal("No channel");
            return;
        }
        if (res.ok) {
            const info = await res.json() as Partial<LiveChannelInfo>;
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
            if (typeof info.emoteTwitchId === "string") {
                emoteTwitchId = info.emoteTwitchId;
            }
        }
    } catch {}
    nameEl.textContent = ctx.displayUsername;
    document.title = ctx.displayUsername;
    browseMiniUsername.textContent = ctx.displayUsername;
    titleEl.textContent = title;
    const hasCategory = !!category;
    const languageLabel = streamLanguageLabel(language);
    const hasLanguage = languageLabel !== null;
    sepEl.classList.toggle("hidden", !title && !hasCategory && !hasLanguage);
    categoryEl.textContent = category;
    if (categoryId !== null) categoryEl.href = `/?category=${categoryId}`;
    else categoryEl.removeAttribute("href");
    categoryEl.classList.toggle("hidden", !hasCategory);
    categorySepEl.classList.toggle("hidden", !title || !hasCategory);
    languageEl.textContent = languageLabel ?? "";
    languageEl.classList.toggle("hidden", !hasLanguage);
    languageSepEl.classList.toggle("hidden", !hasLanguage || (!title && !hasCategory));
    languageEl.title = languageLabel ? `Stream language: ${languageLabel}` : "";

    wireLoginModal();
    startChat(ctx.username, emoteTwitchId, () => openLoginModal("chat"));

    if (chatPopout) {
        document.title = `${ctx.displayUsername} - chat`;
        return;
    }

    void initFollow();
    connectViewcount();

    if (typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function") {
        titleBar.classList.remove("hidden");
        ctx.transportKind = "ws";
    } else if (canUseNativeHLS()) {
        titleBar.classList.remove("hidden");
        ctx.transportKind = "hls";
    } else {
        enterTerminal("Playback not supported");
        return;
    }
    beginTransport();
}

void boot();

export {};
