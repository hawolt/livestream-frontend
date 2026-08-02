import { readLocalStorage, writeLocalStorage } from "./storage.ts";
import { ctx } from "./chat/context.ts";
import {
    avatarToggleEl,
    emoteBtnEl,
    guestLoginEl,
    helpBtnEl,
    helpCloseEl,
    inputEl,
    msgsEl,
    pickerFilterEl,
    profileBtnEl,
    profileCloseEl,
    replyCancelEl,
    sendEl,
    settingsBtnEl,
    settingsCloseEl,
    suggestEl,
    timestampToggleEl,
    userlistCloseEl,
    usersBtnEl,
} from "./chat/dom.ts";
import {
    checkAccountStatus,
    checkAccountWhenVisible,
    connect,
    loadEmotes,
    migrateGuestNick,
    restartChatConnection,
    SESSION_RENEWAL_CHECK_MS,
} from "./chat/connection.ts";
import { autoGrowInput, MAX_TEXT, renderPickerGrid, submit, togglePicker } from "./chat/composer.ts";
import { clearReply } from "./chat/messages.ts";
import {
    applyAvatarPref,
    applyTimestampPref,
    AVATARS_KEY,
    closeProfile,
    setHelp,
    setSettings,
    setUserlist,
    TIMESTAMPS_KEY,
    toggleHelp,
    toggleProfile,
    toggleSettings,
    toggleUserlist,
} from "./chat/panels.ts";
import { acceptSelectedSuggestion, advanceTabCycle, hideSuggest, moveSuggest, updateSuggest } from "./chat/suggest.ts";

let chatStarted = false;

export function startChat(user: string, emoteTwitchId?: string, onLoginRequested?: () => void): void {
    chatStarted = true;
    ctx.destroyed = false;
    ctx.channel = `#${user}`;
    ctx.channelEmoteTwitchId = emoteTwitchId ?? "";
    ctx.requestLogin = onLoginRequested ?? null;
    inputEl.maxLength = MAX_TEXT;
    inputEl.setAttribute("aria-label", "Chat message");
    pickerFilterEl.setAttribute("aria-label", "Filter emotes");
    msgsEl.setAttribute("role", "log");
    msgsEl.setAttribute("aria-label", "Live chat messages");
    msgsEl.setAttribute("aria-live", "polite");
    msgsEl.setAttribute("aria-relevant", "additions text");
    const panelAttributes: Array<[HTMLButtonElement, HTMLElement, string]> = [
        [profileBtnEl, document.getElementById("live-chat-profile") as HTMLElement, "Channel profile"],
        [usersBtnEl, document.getElementById("live-chat-userlist") as HTMLElement, "Viewers"],
        [helpBtnEl, document.getElementById("live-chat-help") as HTMLElement, "Chat commands"],
        [settingsBtnEl, document.getElementById("live-chat-settings") as HTMLElement, "Chat settings"],
    ];
    for (const [trigger, panel, label] of panelAttributes) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "region");
        panel.setAttribute("aria-label", label);
    }
    emoteBtnEl.setAttribute("aria-haspopup", "dialog");
    emoteBtnEl.setAttribute("aria-expanded", "false");
    emoteBtnEl.setAttribute("aria-controls", document.getElementById("live-chat-picker")!.id);
    document.getElementById("live-chat-picker")!.setAttribute("role", "dialog");
    document.getElementById("live-chat-picker")!.setAttribute("aria-label", "Emotes");
    migrateGuestNick();
    void loadEmotes();
    void checkAccountStatus();
    if (ctx.accountStatusTimer === null) {
        ctx.accountStatusTimer = window.setInterval(checkAccountWhenVisible, SESSION_RENEWAL_CHECK_MS);
    }
    document.addEventListener("visibilitychange", checkAccountWhenVisible);
    guestLoginEl.addEventListener("click", (event) => {
        if (!ctx.requestLogin) return;
        event.preventDefault();
        ctx.requestLogin();
    });
    sendEl.addEventListener("click", submit);
    replyCancelEl.addEventListener("click", () => {
        clearReply();
        if (!inputEl.disabled) inputEl.focus();
    });
    emoteBtnEl.addEventListener("click", togglePicker);
    usersBtnEl.addEventListener("click", toggleUserlist);
    userlistCloseEl.addEventListener("click", () => setUserlist(false));
    helpBtnEl.addEventListener("click", toggleHelp);
    helpCloseEl.addEventListener("click", () => setHelp(false));
    settingsBtnEl.addEventListener("click", toggleSettings);
    settingsCloseEl.addEventListener("click", () => setSettings(false));
    profileBtnEl.addEventListener("click", toggleProfile);
    profileCloseEl.addEventListener("click", closeProfile);
    applyTimestampPref(readLocalStorage(TIMESTAMPS_KEY) === "1");
    timestampToggleEl.addEventListener("change", () => {
        applyTimestampPref(timestampToggleEl.checked);
        writeLocalStorage(TIMESTAMPS_KEY, timestampToggleEl.checked ? "1" : "0");
    });
    applyAvatarPref(readLocalStorage(AVATARS_KEY) !== "0");
    avatarToggleEl.addEventListener("change", () => {
        applyAvatarPref(avatarToggleEl.checked);
        writeLocalStorage(AVATARS_KEY, avatarToggleEl.checked ? "1" : "0");
    });
    pickerFilterEl.addEventListener("input", () => renderPickerGrid(pickerFilterEl.value));
    inputEl.addEventListener("input", () => {
        autoGrowInput();
        updateSuggest();
    });
    inputEl.addEventListener("click", updateSuggest);
    inputEl.addEventListener("keyup", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") updateSuggest();
    });
    inputEl.addEventListener("keydown", (e) => {
        const suggestOpen = !suggestEl.hidden;
        if (suggestOpen && e.key === "Tab") {
            e.preventDefault();
            advanceTabCycle(e.shiftKey);
            return;
        }
        if (suggestOpen && !ctx.tabCycleRange && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            moveSuggest(e.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (ctx.tabCycleRange && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            ctx.tabCycleRange = null;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            if (suggestOpen && !ctx.tabCycleRange && acceptSelectedSuggestion()) return;
            ctx.tabCycleRange = null;
            submit();
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
        if (!suggestEl.hidden) {
            hideSuggest();
        } else if (ctx.replyTo) {
            clearReply();
            if (!inputEl.disabled) inputEl.focus();
        } else if (ctx.userlistOpen) {
            setUserlist(false);
        } else if (ctx.helpOpen) {
            setHelp(false);
        } else if (ctx.settingsOpen) {
            setSettings(false);
        } else if (ctx.profileOpen) {
            closeProfile();
        } else {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
    connect();
}

export function reconnectChatAfterLogin(): void {
    ctx.accountStatusRevision++;
    ctx.isAccount = true;
    ctx.accountStatusResolved = true;
    ctx.accountSessionToken = "";
    ctx.banned = false;
    ctx.banRetry = false;
    restartChatConnection();
}

export function suspendChat(): void {
    if (!chatStarted) return;
    ctx.destroyed = true;
    ctx.accountStatusRevision++;
    ctx.accountStatusRequest = null;
    if (ctx.retryTimer !== null) {
        window.clearTimeout(ctx.retryTimer);
        ctx.retryTimer = null;
    }
    ctx.sock?.close();
}

export function resumeChat(): void {
    if (!chatStarted || !ctx.destroyed) return;
    ctx.destroyed = false;
    void checkAccountStatus();
    connect();
}

export function stopChat(): void {
    suspendChat();
    if (ctx.accountStatusTimer !== null) {
        window.clearInterval(ctx.accountStatusTimer);
        ctx.accountStatusTimer = null;
    }
    document.removeEventListener("visibilitychange", checkAccountWhenVisible);
}
