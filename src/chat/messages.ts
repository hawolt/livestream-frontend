import { ctx, myNickLower } from "./context.ts";
import { inputEl, msgsEl, pickerFilterEl, replyBarEl, replyLabelEl, suggestEl } from "./dom.ts";
import { buildBadges } from "./badges.ts";
import { hasModRole, nickColor } from "./members.ts";
import { cssEsc, mentionsMe, truncate } from "./text.ts";
import { buildAvatar, buildRenderedBody, buildTimeSpan, RENDERED_BODY_CLASS, renderBody } from "./render.ts";
import { send } from "./connection.ts";
import { renderPickerGrid } from "./composer.ts";
import { updateSuggest } from "./suggest.ts";
import { renderPins } from "./pins.ts";
import { openProfileFromUser } from "./panels.ts";

export const MAX_MESSAGES = 200;
const SCROLL_SLACK_PX = 40;

function atBottom(): boolean {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < SCROLL_SLACK_PX;
}

export function append(node: HTMLElement): void {
    const stick = atBottom();
    const empty = msgsEl.querySelector(".live-chat-empty");
    if (empty) empty.remove();
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    if (stick) msgsEl.scrollTop = msgsEl.scrollHeight;
}

export function addSystem(text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-sys";
    line.textContent = text;
    append(line);
}

export function findMessageEl(msgid: string): HTMLElement | null {
    return msgsEl.querySelector(`.live-chat-msg[data-msgid="${cssEsc(msgid)}"]`);
}

export function setReply(msgid: string, from: string, text: string): void {
    ctx.replyTo = { msgid, from, text };
    updateReplyBar();
    if (!inputEl.disabled) inputEl.focus();
}

export function clearReply(): void {
    ctx.replyTo = null;
    updateReplyBar();
}

export function updateReplyBar(): void {
    if (!ctx.replyTo || !ctx.joined || ctx.banned) {
        replyBarEl.hidden = true;
        replyLabelEl.replaceChildren();
        return;
    }
    const pre = document.createTextNode("Replying to ");
    const who = document.createElement("b");
    who.textContent = ctx.replyTo.from;
    const rest = document.createTextNode(": " + truncate(ctx.replyTo.text, 60));
    replyLabelEl.replaceChildren(pre, who, rest);
    replyBarEl.hidden = false;
}

export function jumpToMessage(msgid: string): void {
    const el = findMessageEl(msgid);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("live-chat-flash");
    void el.offsetWidth;
    el.classList.add("live-chat-flash");
    window.setTimeout(() => el.classList.remove("live-chat-flash"), 1500);
}

function buildNick(from: string): HTMLSpanElement {
    const nick = document.createElement("span");
    nick.className = "live-chat-nick";
    nick.textContent = from;
    nick.style.color = nickColor(from);
    nick.addEventListener("click", () => {
        if (document.body.classList.contains("chat-popout")) return;
        openProfileFromUser(from);
    });
    return nick;
}

function buildQuote(replyId: string): { el: HTMLElement; parentFrom: string } {
    const q = document.createElement("div");
    q.className = "live-chat-quote";
    const arrow = document.createElement("span");
    arrow.className = "live-chat-quote-arrow";
    arrow.textContent = "↩";
    q.appendChild(arrow);
    const parent = findMessageEl(replyId);
    let parentFrom = "";
    if (parent) {
        parentFrom = parent.dataset["from"] ?? "";
        const body = parent.dataset["text"] ?? "";
        const who = document.createElement("span");
        who.className = "live-chat-quote-who";
        who.textContent = parentFrom;
        q.append(who, document.createTextNode(": " + truncate(body, 50)));
        q.title = "Jump to message";
        q.addEventListener("click", () => jumpToMessage(replyId));
    } else {
        q.appendChild(document.createTextNode("replying to a message"));
    }
    return { el: q, parentFrom };
}

function buildActions(from: string, text: string, msgid: string): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "live-chat-actions";
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "live-chat-reply-btn";
    reply.title = "Reply";
    reply.setAttribute("aria-label", `Reply to ${from}`);
    reply.textContent = "↩";
    reply.addEventListener("click", () => setReply(msgid, from, text));
    actions.appendChild(reply);
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "live-chat-pin-btn";
    pin.title = "Pin message";
    pin.setAttribute("aria-label", `Pin message from ${from}`);
    pin.textContent = "📌";
    pin.addEventListener("click", () => send(`PRIVMSG ${ctx.channel} :.pin ${msgid}`));
    actions.appendChild(pin);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "live-chat-del";
    del.title = "Delete message";
    del.setAttribute("aria-label", `Delete message from ${from}`);
    del.textContent = "✕";
    del.addEventListener("click", () => send(`PRIVMSG ${ctx.channel} :.delete ${msgid}`));
    actions.appendChild(del);
    return actions;
}

export function addMessage(
    from: string,
    text: string,
    msgid?: string,
    replyId?: string,
    sentAt?: string,
    userId?: string,
    avatar?: string,
): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg";
    line.dataset["from"] = from;
    line.dataset["text"] = text;

    let repliedToMe = false;
    if (replyId) {
        const quote = buildQuote(replyId);
        line.appendChild(quote.el);
        repliedToMe = quote.parentFrom.toLowerCase() === myNickLower();
    }

    line.appendChild(buildTimeSpan(sentAt));
    line.appendChild(buildAvatar(from, userId, avatar));
    const who = buildNick(from);
    const badges = buildBadges(from);
    if (badges.length) line.append(...badges);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    if (from.toLowerCase() === myNickLower()) line.classList.add("live-chat-own");
    if (msgid) {
        line.dataset["msgid"] = msgid;
        line.appendChild(buildActions(from, text, msgid));
    }
    if (repliedToMe || mentionsMe(text)) line.classList.add("live-chat-mentioned");
    append(line);
}

export function redactMessageEl(el: HTMLElement): void {
    const from = el.dataset["from"] ?? "";
    el.replaceChildren();
    el.classList.remove("live-chat-mentioned");
    const badges = buildBadges(from);
    if (badges.length) el.append(...badges);
    const who = buildNick(from);
    const placeholder = document.createElement("span");
    placeholder.className = "live-chat-deleted";
    placeholder.textContent = "<deleted message>";
    el.append(who, document.createTextNode(": "), placeholder);
    el.removeAttribute("data-msgid");
    el.dataset["text"] = "<deleted message>";
}

export function addHiddenMessage(from: string, text: string, userId?: string, avatar?: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-automod";
    line.dataset["from"] = from;
    line.dataset["text"] = text;
    const tag = document.createElement("span");
    tag.className = "live-chat-automod-tag";
    tag.textContent = "blocked";
    tag.title = "Removed by automod. Only moderators see this message.";
    line.append(tag, buildAvatar(from, userId, avatar));
    const who = buildNick(from);
    const badges = buildBadges(from);
    if (badges.length) line.append(...badges);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}

export function addWhisper(from: string, target: string, text: string, userId?: string, avatar?: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-whisper";
    line.appendChild(buildAvatar(from, userId, avatar));
    const tag = document.createElement("span");
    tag.className = "live-chat-whisper-tag";
    const outgoing = from.toLowerCase() === myNickLower();
    tag.textContent = outgoing ? `↪ ${target}` : `${from} whispers`;
    line.append(tag, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}

export function updateModTools(): void {
    msgsEl.classList.toggle("live-chat-can-mod", ctx.joined && ctx.capRedact && hasModRole());
    renderPins();
}

export function refreshEmoteRendering(): void {
    const stick = atBottom();
    const previousHeight = msgsEl.scrollHeight;
    for (const body of Array.from(document.querySelectorAll<HTMLElement>(`.${RENDERED_BODY_CLASS}`))) {
        body.replaceChildren(renderBody(body.dataset["rawText"] ?? ""));
    }
    if (ctx.pickerOpen) renderPickerGrid(pickerFilterEl.value);
    if (!suggestEl.hidden) updateSuggest();
    if (stick) {
        msgsEl.scrollTop = msgsEl.scrollHeight;
    } else {
        msgsEl.scrollTop += msgsEl.scrollHeight - previousHeight;
    }
}
