import { ctx, myNickLower } from "./context.ts";
import { inputEl, msgsEl, pickerFilterEl, replyBarEl, replyLabelEl, suggestEl } from "./dom.ts";
import { buildBadges } from "./badges.ts";
import { hasModRole, nickColor } from "./members.ts";
import { cssEsc, mentionsMe, truncate } from "./text.ts";
import { buildRenderedBody, buildTimeSpan, RENDERED_BODY_CLASS, renderBody } from "./render.ts";
import { send } from "./connection.ts";
import { renderPickerGrid } from "./composer.ts";
import { updateSuggest } from "./suggest.ts";
import { renderPins } from "./pins.ts";
import { motionScrollBehavior } from "../motion.ts";

export const MAX_MESSAGES = 200;
const SCROLL_SLACK_PX = 40;

function atBottom(): boolean {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < SCROLL_SLACK_PX;
}

function actionableMessages(): HTMLElement[] {
    return Array.from(msgsEl.querySelectorAll<HTMLElement>(".live-chat-msg[data-chat-actionable]"));
}

function setRovingMessage(target: HTMLElement, focus: boolean): void {
    for (const message of actionableMessages()) message.tabIndex = message === target ? 0 : -1;
    if (focus) target.focus();
}

function syncRovingMessage(): void {
    const messages = actionableMessages();
    if (!messages.length || messages.some(message => message.tabIndex === 0)) return;
    messages[messages.length - 1]!.tabIndex = 0;
}

function messageControls(message: HTMLElement): HTMLButtonElement[] {
    return Array.from(message.querySelectorAll<HTMLButtonElement>("button.live-chat-quote, .live-chat-actions button"))
        .filter(button => getComputedStyle(button).display !== "none");
}

function moveRovingMessage(message: HTMLElement, key: string): boolean {
    const messages = actionableMessages();
    const index = messages.indexOf(message);
    if (index < 0) return false;
    let next = index;
    if (key === "ArrowUp") next = Math.max(0, index - 1);
    else if (key === "ArrowDown") next = Math.min(messages.length - 1, index + 1);
    else if (key === "Home") next = 0;
    else if (key === "End") next = messages.length - 1;
    else return false;
    setRovingMessage(messages[next]!, true);
    return true;
}

function registerActionableMessage(message: HTMLElement): void {
    const controls = messageControls(message);
    if (!controls.length) return;
    message.dataset["chatActionable"] = "";
    const keepCurrent = msgsEl.contains(document.activeElement);
    message.tabIndex = -1;
    if (!keepCurrent) setRovingMessage(message, false);
    message.addEventListener("focus", (event) => {
        if (event.target === message) setRovingMessage(message, false);
    });
    message.addEventListener("keydown", (event) => {
        if (event.target === message) {
            if (moveRovingMessage(message, event.key)) {
                event.preventDefault();
                return;
            }
            if (event.key === "Enter" || event.key === "ArrowRight") {
                const first = messageControls(message)[0];
                if (!first) return;
                event.preventDefault();
                first.focus();
            }
            return;
        }
        const target = event.target as HTMLButtonElement;
        const currentControls = messageControls(message);
        const index = currentControls.indexOf(target);
        if (event.key === "Escape") {
            event.preventDefault();
            message.focus();
        } else if (index >= 0 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? -1 : 1;
            currentControls[(index + delta + currentControls.length) % currentControls.length]!.focus();
        }
    });
}

export function append(node: HTMLElement): void {
    const stick = atBottom();
    const empty = msgsEl.querySelector(".live-chat-empty");
    if (empty) empty.remove();
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    syncRovingMessage();
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
    el.scrollIntoView({ block: "center", behavior: motionScrollBehavior() });
    el.classList.remove("live-chat-flash");
    void el.offsetWidth;
    el.classList.add("live-chat-flash");
    window.setTimeout(() => el.classList.remove("live-chat-flash"), 1500);
}

function buildQuote(replyId: string): { el: HTMLElement; parentFrom: string } {
    const parent = findMessageEl(replyId);
    const q = document.createElement(parent ? "button" : "div");
    q.className = "live-chat-quote";
    if (q instanceof HTMLButtonElement) {
        q.type = "button";
        q.tabIndex = -1;
    }
    const arrow = document.createElement("span");
    arrow.className = "live-chat-quote-arrow";
    arrow.textContent = "↩";
    q.appendChild(arrow);
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
    reply.tabIndex = -1;
    reply.textContent = "↩";
    reply.addEventListener("click", () => setReply(msgid, from, text));
    actions.appendChild(reply);
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "live-chat-pin-btn";
    pin.title = "Pin message";
    pin.setAttribute("aria-label", `Pin message from ${from}`);
    pin.tabIndex = -1;
    pin.textContent = "📌";
    pin.addEventListener("click", () => send(`PRIVMSG ${ctx.channel} :.pin ${msgid}`));
    actions.appendChild(pin);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "live-chat-del";
    del.title = "Delete message";
    del.setAttribute("aria-label", `Delete message from ${from}`);
    del.tabIndex = -1;
    del.textContent = "✕";
    del.addEventListener("click", () => send(`PRIVMSG ${ctx.channel} :.delete ${msgid}`));
    actions.appendChild(del);
    return actions;
}

export function addMessage(from: string, text: string, msgid?: string, replyId?: string, sentAt?: string): void {
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
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
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
    registerActionableMessage(line);
}

export function redactMessageEl(el: HTMLElement): void {
    const from = el.dataset["from"] ?? "";
    el.replaceChildren();
    el.classList.remove("live-chat-mentioned");
    const badges = buildBadges(from);
    if (badges.length) el.append(...badges);
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    const placeholder = document.createElement("span");
    placeholder.className = "live-chat-deleted";
    placeholder.textContent = "<deleted message>";
    el.append(who, document.createTextNode(": "), placeholder);
    el.removeAttribute("data-msgid");
    el.removeAttribute("data-chat-actionable");
    el.removeAttribute("tabindex");
    el.dataset["text"] = "<deleted message>";
    syncRovingMessage();
}

export function addHiddenMessage(from: string, text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-automod";
    line.dataset["from"] = from;
    line.dataset["text"] = text;
    const tag = document.createElement("span");
    tag.className = "live-chat-automod-tag";
    tag.textContent = "blocked";
    tag.title = "Removed by automod. Only moderators see this message.";
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    const badges = buildBadges(from);
    line.append(tag);
    if (badges.length) line.append(...badges);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}

export function addWhisper(from: string, target: string, text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-whisper";
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
