import { readLocalStorage, writeLocalStorage } from "./storage.ts";
import { ctx } from "./chat/context.ts";
import {
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
import { autoGrowInput, closePicker, MAX_TEXT, renderPickerGrid, submit, togglePicker } from "./chat/composer.ts";
import { clearReply } from "./chat/messages.ts";
import {
    applyTimestampPref,
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

export function startChat(user: string, emoteTwitchId?: string, onLoginRequested?: () => void): void {
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
    replyCancelEl.addEventListener("click", clearReply);
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
        if (e.key !== "Escape") return;
        closePicker();
        hideSuggest();
        clearReply();
        if (ctx.userlistOpen) setUserlist(false);
        if (ctx.helpOpen) setHelp(false);
        if (ctx.settingsOpen) setSettings(false);
        if (ctx.profileOpen) closeProfile();
    });
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

export function stopChat(): void {
    ctx.destroyed = true;
    ctx.accountStatusRevision++;
    ctx.accountStatusRequest = null;
    if (ctx.accountStatusTimer !== null) {
        window.clearInterval(ctx.accountStatusTimer);
        ctx.accountStatusTimer = null;
    }
    document.removeEventListener("visibilitychange", checkAccountWhenVisible);
    if (ctx.retryTimer !== null) window.clearTimeout(ctx.retryTimer);
    ctx.sock?.close();
}
