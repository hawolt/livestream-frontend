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

export const MAX_TEXT = 400;

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
    if (ctx.banned) {
        inputRowEl.hidden = true;
        guestLoginEl.hidden = true;
        verifyEl.hidden = true;
        closePicker();
        hideSuggest();
        updateReplyBar();
        return;
    }
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
    const img = document.createElement("img");
    img.src = emotes.get(name)?.url ?? "";
    img.alt = name;
    img.title = name;
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
    if (emotes.size === 0) {
        pickerGridEl.appendChild(pickerEmpty("Emotes unavailable"));
        return;
    }
    const lower = filter.trim().toLowerCase();
    const names = Array.from(emotes.names())
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
    emoteBtnEl.classList.add("active");
    pickerFilterEl.value = "";
    renderPickerGrid("");
    pickerEl.hidden = false;
    hideSuggest();
    document.addEventListener("mousedown", onPickerOutsideMouseDown, true);
    pickerFilterEl.focus();
}

export function closePicker(): void {
    if (!ctx.pickerOpen) return;
    ctx.pickerOpen = false;
    emoteBtnEl.classList.remove("active");
    pickerEl.hidden = true;
    document.removeEventListener("mousedown", onPickerOutsideMouseDown, true);
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

export function submit(): void {
    const text = inputEl.value.replace(/[\r\n]/g, " ").trim().slice(0, MAX_TEXT);
    if (!text || !ctx.joined) return;
    const r = ctx.replyTo;
    const cmdWord = text.startsWith(".") ? text.split(" ")[0]!.toLowerCase() : "";
    const isWhisper = cmdWord === ".whisper" || cmdWord === ".w";
    const serverHandles = isWhisper || (cmdWord !== "" && hasModRole());
    const tag = r && !isWhisper ? `@+reply=${r.msgid} ` : "";
    send(`${tag}PRIVMSG ${ctx.channel} :${text}`);
    if (!ctx.capEcho && !serverHandles) addMessage(ctx.nick, text, undefined, r?.msgid);
    inputEl.value = "";
    autoGrowInput();
    clearReply();
    hideSuggest();
    msgsEl.scrollTop = msgsEl.scrollHeight;
}
