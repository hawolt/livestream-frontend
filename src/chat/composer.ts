import { API_BASE } from "../api.ts";
import { ctx, emotes } from "./context.ts";
import {
    emoteBtnEl,
    guestLoginEl,
    inputEl,
    inputRowEl,
    msgsEl,
    pickerEl,
    pickerFilterEl,
    pickerGridEl,
    sendEl,
    verifyEl,
} from "./dom.ts";
import { guests, hasModRole, unverified } from "./members.ts";
import { send } from "./connection.ts";
import { addMessage, clearReply, updateReplyBar } from "./messages.ts";
import { hideSuggest } from "./suggest.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { normalizedCommandWord } from "./text.ts";
import { interceptComposerSubmit, syncRedeemPicker } from "./redeem-picker.ts";

export const MAX_TEXT = 400;

let pickerReturnFocus: HTMLElement | null = null;

let myEmotes = new Map<string, string>();
let myEmotesLoaded = false;

async function ensureMyEmotesLoaded(): Promise<void> {
    if (myEmotesLoaded || !ctx.isAccount) return;
    myEmotesLoaded = true;
    try {
        const res = await fetch(`${API_BASE}/profile/me/emotes`, { credentials: "include" });
        if (!res.ok) return;
        const payload: any = await res.json();
        const next = new Map<string, string>();
        for (const pool of Object.values(payload?.pools ?? {})) {
            for (const emote of (pool as any)?.emotes ?? []) {
                if (emote?.locked || emote?.enabled === false) continue;
                if (typeof emote?.name === "string" && typeof emote?.previewUrl === "string") {
                    next.set(emote.name, emote.previewUrl);
                }
            }
        }
        myEmotes = next;
        if (ctx.pickerOpen) renderPickerGrid(pickerFilterEl.value);
    } catch {}
}

function resetMyEmotesCache(): void {
    myEmotes = new Map();
    myEmotesLoaded = false;
}

function isGuestNow(): boolean {
    return !ctx.isAccount || guests.has(ctx.nick.toLowerCase());
}

function isSelfUnverified(): boolean {
    return ctx.isAccount && unverified.has(ctx.nick.toLowerCase());
}

function showComposerInput(enabled: boolean): void {
    inputRowEl.hidden = false;
    guestLoginEl.hidden = true;
    verifyEl.hidden = true;
    inputEl.disabled = !enabled;
    sendEl.disabled = !enabled;
    emoteBtnEl.disabled = !enabled;
    inputEl.placeholder = enabled ? `Chat as ${ctx.nick}` : "Send message";
    if (!enabled) {
        closePicker();
        hideSuggest();
    }
}

function showGuestLogin(): void {
    inputRowEl.hidden = true;
    guestLoginEl.hidden = false;
    verifyEl.hidden = true;
    guestLoginEl.href = `/login?return=${encodeURIComponent(location.href)}`;
    closePicker();
    hideSuggest();
}

function showVerifyEmail(): void {
    inputRowEl.hidden = true;
    guestLoginEl.hidden = true;
    verifyEl.hidden = false;
    closePicker();
    hideSuggest();
}

export function updateComposer(): void {
    syncRedeemPicker();
    if (ctx.banned) {
        inputRowEl.hidden = true;
        guestLoginEl.hidden = true;
        verifyEl.hidden = true;
        closePicker();
        hideSuggest();
        updateReplyBar();
        return;
    }
    if (!ctx.isAccount) resetMyEmotesCache();
    if (!ctx.joined) {
        showComposerInput(false);
        updateReplyBar();
        return;
    }
    if (isGuestNow()) {
        showGuestLogin();
    } else if (isSelfUnverified()) {
        showVerifyEmail();
    } else {
        showComposerInput(true);
    }
    updateReplyBar();
}

function buildEmoteCell(name: string): HTMLButtonElement {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "live-chat-picker-cell";
    if (myEmotes.has(name)) cell.classList.add("live-chat-picker-cell-mine");
    const img = document.createElement("img");
    img.src = myEmotes.get(name) ?? emotes.get(name)?.url ?? "";
    img.referrerPolicy = "no-referrer";
    img.alt = name;
    img.title = myEmotes.has(name) ? `${name} (yours)` : name;
    img.loading = "lazy";
    cell.appendChild(img);
    cell.addEventListener("click", () => insertEmoteAtCaret(name));
    return cell;
}

function pickerEmpty(text: string): HTMLDivElement {
    const empty = document.createElement("div");
    empty.className = "live-chat-picker-empty";
    empty.textContent = text;
    return empty;
}

export function renderPickerGrid(filter: string): void {
    pickerGridEl.replaceChildren();
    if (emotes.size === 0 && myEmotes.size === 0) {
        pickerGridEl.appendChild(pickerEmpty("Emotes unavailable"));
        return;
    }
    const lower = filter.trim().toLowerCase();
    const names = Array.from(new Set([...emotes.names(), ...myEmotes.keys()]))
        .filter((name) => !lower || name.toLowerCase().includes(lower))
        .sort((a, b) => a.localeCompare(b));
    if (!names.length) {
        pickerGridEl.appendChild(pickerEmpty("No emotes match"));
        return;
    }
    for (const name of names) pickerGridEl.appendChild(buildEmoteCell(name));
}

function onPickerOutsideMouseDown(e: MouseEvent): void {
    const target = e.target as Node;
    if (pickerEl.contains(target) || emoteBtnEl.contains(target)) return;
    closePicker();
}

export function openPicker(): void {
    if (ctx.pickerOpen) return;
    ctx.pickerOpen = true;
    pickerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : emoteBtnEl;
    emoteBtnEl.classList.add("active");
    emoteBtnEl.setAttribute("aria-expanded", "true");
    pickerFilterEl.value = "";
    renderPickerGrid("");
    pickerEl.hidden = false;
    hideSuggest();
    openDismissibleSurface(pickerEl, () => closePicker(true));
    document.addEventListener("mousedown", onPickerOutsideMouseDown, true);
    pickerFilterEl.focus();
    void ensureMyEmotesLoaded();
}

export function closePicker(restoreFocus = false): void {
    if (!ctx.pickerOpen) return;
    ctx.pickerOpen = false;
    emoteBtnEl.classList.remove("active");
    emoteBtnEl.setAttribute("aria-expanded", "false");
    pickerEl.hidden = true;
    closeDismissibleSurface(pickerEl);
    document.removeEventListener("mousedown", onPickerOutsideMouseDown, true);
    const returnFocus = pickerReturnFocus;
    pickerReturnFocus = null;
    if (restoreFocus && returnFocus?.isConnected && returnFocus.offsetParent !== null && !returnFocus.closest("[inert]")) {
        returnFocus.focus();
    }
}

export function togglePicker(): void {
    if (ctx.pickerOpen) closePicker();
    else openPicker();
}

function insertEmoteAtCaret(name: string): void {
    const val = inputEl.value;
    const start = inputEl.selectionStart ?? val.length;
    const end = inputEl.selectionEnd ?? val.length;
    const before = val.slice(0, start);
    const after = val.slice(end);
    const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const trail = after.length === 0 || !/^\s/.test(after) ? " " : "";
    const insert = lead + name + trail;
    inputEl.value = before + insert + after;
    const caret = (before + insert).length;
    inputEl.setSelectionRange(caret, caret);
    inputEl.focus();
}

export function autoGrowInput(): void {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
}

function finishSubmit(): void {
    inputEl.value = "";
    autoGrowInput();
    clearReply();
    hideSuggest();
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

export function submit(): void {
    const text = inputEl.value.replace(/[\r\n]/g, " ").trim().slice(0, MAX_TEXT);
    if (!text || !ctx.joined) return;
    if (interceptComposerSubmit(text, finishSubmit)) return;
    const r = ctx.replyTo;
    const cmdWord = normalizedCommandWord(text);
    const isWhisper = cmdWord === ".whisper" || cmdWord === ".w";
    const isRaidCmd = cmdWord === ".raidjoin" || cmdWord === ".raidstay";
    const serverHandles = isWhisper || isRaidCmd || (cmdWord !== "" && hasModRole());
    const tag = r && !isWhisper ? `@+reply=${r.msgid} ` : "";
    send(`${tag}PRIVMSG ${ctx.channel} :${text}`);
    if (!ctx.capEcho && !serverHandles) addMessage(ctx.nick, text, undefined, r?.msgid);
    finishSubmit();
}
