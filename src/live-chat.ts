import { readLocalStorage, writeLocalStorage } from "./storage.ts";
import { ctx } from "./chat/context.ts";
import { primePingAudio } from "./chat/ping-sound.ts";
import {
    avatarToggleEl,
    emoteBtnEl,
    guestLoginEl,
    helpBtnEl,
    helpCloseEl,
    inputEl,
    msgsEl,
    pickerFilterEl,
    pingMuteToggleEl,
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
import { preserveMessagesScroll, wireScrollPinning } from "./chat/scroll.ts";
import { setClipCardScrollGuard } from "./chat/clip-card.ts";
import {
    applyAvatarPref,
    applyMutePingsPref,
    applyTimestampPref,
    AVATARS_KEY,
    MUTE_PINGS_KEY,
    setHelp,
    setSettings,
    setUserlist,
    TIMESTAMPS_KEY,
    toggleHelp,
    toggleSettings,
    toggleUserlist,
} from "./chat/panels.ts";
import { acceptSelectedSuggestion, advanceTabCycle, hideSuggest, moveSuggest, updateSuggest } from "./chat/suggest.ts";
import { GEAR_ICON } from "./nav/account-menu.ts";
import { destroyBadgePicker, initBadgePicker } from "./chat/badge-picker.ts";
import {
    closeRedeemPop,
    destroyRedeemPicker,
    disarmHighlight,
    initRedeemPicker,
    isHighlightArmed,
    isRedeemPopOpen,
} from "./chat/redeem-picker.ts";

let chatStarted = false;
let teardownListeners: (() => void) | null = null;

export function startChat(user: string, emoteTwitchId?: string, onLoginRequested?: () => void): void {
    if (chatStarted) stopChat();
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
    wireScrollPinning();
    setClipCardScrollGuard(preserveMessagesScroll);
    const panelAttributes: Array<[HTMLButtonElement, HTMLElement, string]> = [
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
    settingsBtnEl.innerHTML = GEAR_ICON;
    initBadgePicker(settingsBtnEl);
    initRedeemPicker(settingsBtnEl);
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
    const onGuestLoginClick = (event: MouseEvent): void => {
        if (!ctx.requestLogin) return;
        event.preventDefault();
        ctx.requestLogin();
    };
    guestLoginEl.addEventListener("click", onGuestLoginClick);
    sendEl.addEventListener("click", submit);
    const onReplyCancelClick = (): void => {
        clearReply();
        if (!inputEl.disabled) inputEl.focus();
    };
    replyCancelEl.addEventListener("click", onReplyCancelClick);
    emoteBtnEl.addEventListener("click", togglePicker);
    usersBtnEl.addEventListener("click", toggleUserlist);
    const onUserlistCloseClick = (): void => setUserlist(false);
    userlistCloseEl.addEventListener("click", onUserlistCloseClick);
    helpBtnEl.addEventListener("click", toggleHelp);
    const onHelpCloseClick = (): void => setHelp(false);
    helpCloseEl.addEventListener("click", onHelpCloseClick);
    settingsBtnEl.addEventListener("click", toggleSettings);
    const onSettingsCloseClick = (): void => setSettings(false);
    settingsCloseEl.addEventListener("click", onSettingsCloseClick);
    applyTimestampPref(readLocalStorage(TIMESTAMPS_KEY) === "1");
    const onTimestampToggleChange = (): void => {
        applyTimestampPref(timestampToggleEl.checked);
        writeLocalStorage(TIMESTAMPS_KEY, timestampToggleEl.checked ? "1" : "0");
    };
    timestampToggleEl.addEventListener("change", onTimestampToggleChange);
    applyAvatarPref(readLocalStorage(AVATARS_KEY) !== "0");
    const onAvatarToggleChange = (): void => {
        applyAvatarPref(avatarToggleEl.checked);
        writeLocalStorage(AVATARS_KEY, avatarToggleEl.checked ? "1" : "0");
    };
    avatarToggleEl.addEventListener("change", onAvatarToggleChange);
    applyMutePingsPref(readLocalStorage(MUTE_PINGS_KEY) === "1");
    const onMutePingsToggleChange = (): void => {
        applyMutePingsPref(pingMuteToggleEl.checked);
        writeLocalStorage(MUTE_PINGS_KEY, pingMuteToggleEl.checked ? "1" : "0");
    };
    pingMuteToggleEl.addEventListener("change", onMutePingsToggleChange);
    const onFirstInteraction = (): void => primePingAudio();
    document.addEventListener("click", onFirstInteraction);
    inputEl.addEventListener("focus", onFirstInteraction);
    const onPickerFilterInput = (): void => renderPickerGrid(pickerFilterEl.value);
    pickerFilterEl.addEventListener("input", onPickerFilterInput);
    const onInputInput = (): void => {
        autoGrowInput();
        updateSuggest();
    };
    inputEl.addEventListener("input", onInputInput);
    inputEl.addEventListener("click", updateSuggest);
    const onInputKeyup = (e: KeyboardEvent): void => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") updateSuggest();
    };
    inputEl.addEventListener("keyup", onInputKeyup);
    const onInputKeydown = (e: KeyboardEvent): void => {
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
    };
    inputEl.addEventListener("keydown", onInputKeydown);
    const onDocumentKeydown = (e: KeyboardEvent): void => {
        if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
        if (isRedeemPopOpen()) {
            closeRedeemPop();
        } else if (!suggestEl.hidden) {
            hideSuggest();
        } else if (isHighlightArmed()) {
            disarmHighlight();
        } else if (ctx.replyTo) {
            clearReply();
            if (!inputEl.disabled) inputEl.focus();
        } else if (ctx.userlistOpen) {
            setUserlist(false);
        } else if (ctx.helpOpen) {
            setHelp(false);
        } else if (ctx.settingsOpen) {
            setSettings(false);
        } else {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", onDocumentKeydown, true);
    connect();

    teardownListeners = (): void => {
        document.removeEventListener("visibilitychange", checkAccountWhenVisible);
        guestLoginEl.removeEventListener("click", onGuestLoginClick);
        sendEl.removeEventListener("click", submit);
        replyCancelEl.removeEventListener("click", onReplyCancelClick);
        emoteBtnEl.removeEventListener("click", togglePicker);
        usersBtnEl.removeEventListener("click", toggleUserlist);
        userlistCloseEl.removeEventListener("click", onUserlistCloseClick);
        helpBtnEl.removeEventListener("click", toggleHelp);
        helpCloseEl.removeEventListener("click", onHelpCloseClick);
        settingsBtnEl.removeEventListener("click", toggleSettings);
        settingsCloseEl.removeEventListener("click", onSettingsCloseClick);
        destroyBadgePicker();
        destroyRedeemPicker();
        timestampToggleEl.removeEventListener("change", onTimestampToggleChange);
        avatarToggleEl.removeEventListener("change", onAvatarToggleChange);
        pingMuteToggleEl.removeEventListener("change", onMutePingsToggleChange);
        document.removeEventListener("click", onFirstInteraction);
        inputEl.removeEventListener("focus", onFirstInteraction);
        pickerFilterEl.removeEventListener("input", onPickerFilterInput);
        inputEl.removeEventListener("input", onInputInput);
        inputEl.removeEventListener("click", updateSuggest);
        inputEl.removeEventListener("keyup", onInputKeyup);
        inputEl.removeEventListener("keydown", onInputKeydown);
        document.removeEventListener("keydown", onDocumentKeydown, true);
    };
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
    if (!chatStarted) return;
    suspendChat();
    if (ctx.accountStatusTimer !== null) {
        window.clearInterval(ctx.accountStatusTimer);
        ctx.accountStatusTimer = null;
    }
    teardownListeners?.();
    teardownListeners = null;
    chatStarted = false;
}
