import { hashColor } from "../chat/text.ts";
import { sanitizeSubscriberBadgeName, subscriberBadgeAssetPath, subscriberBadgeTitle } from "../chat/badges.ts";
import { MAX_MESSAGES, RENDERED_BODY_CLASS, ctx, emotes, isOwner, msgsEl, roles, subscriberBadges, subscribers, unverified, vips } from "./context.ts";

type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "regular" | "unverified";

function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    return img;
}

function makeSubscriberBadge(key: string): HTMLImageElement {
    const name = sanitizeSubscriberBadgeName(subscriberBadges.get(key));
    const img = document.createElement("img");
    img.className = "badge";
    img.src = subscriberBadgeAssetPath(name);
    img.alt = "regular";
    img.title = subscriberBadgeTitle(name);
    if (name !== "regular") {
        img.addEventListener("error", () => {
            img.src = "/static/img/badge-regular.svg";
            img.alt = "regular";
        }, { once: true });
    }
    return img;
}

function buildBadges(from: string): HTMLImageElement[] {
    if (!ctx.showBadges) return [];
    const key = from.toLowerCase();
    const role = roles.get(key);
    const badges: HTMLImageElement[] = [];
    if (role === "staff") badges.push(makeBadge("staff"));
    if (isOwner(from)) badges.push(makeBadge("op"));
    if (role === "bot") badges.push(makeBadge("bot"));
    if (role === "mod") badges.push(makeBadge("mod"));
    if (vips.has(key)) badges.push(makeBadge("vip"));
    if (subscribers.has(key)) badges.push(makeSubscriberBadge(key));
    if (unverified.has(key)) badges.push(makeBadge("unverified"));
    return badges;
}

function buildOverlayEmote(token: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "emote";
    img.src = url;
    img.alt = token;
    img.title = token;
    return img;
}

function renderBody(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
            pendingWs += token;
            continue;
        }
        const emote = ctx.showEmotes ? emotes.get(token) : undefined;
        const url = emote?.url;
        if (url && emote.zeroWidth && lastStack) {
            const img = buildOverlayEmote(token, url);
            img.classList.add("emote-zw");
            lastStack.appendChild(img);
            pendingWs = "";
            continue;
        }
        if (pendingWs) {
            frag.appendChild(document.createTextNode(pendingWs));
            pendingWs = "";
        }
        if (!url) {
            frag.appendChild(document.createTextNode(token));
            lastStack = null;
            continue;
        }
        const stack = document.createElement("span");
        stack.className = "emote-stack";
        stack.appendChild(buildOverlayEmote(token, url));
        frag.appendChild(stack);
        lastStack = stack;
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
    return frag;
}

function buildRenderedBody(text: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    body.appendChild(renderBody(text));
    return body;
}

export function refreshEmoteRendering(): void {
    for (const body of Array.from(msgsEl.querySelectorAll<HTMLElement>(`.${RENDERED_BODY_CLASS}`))) {
        body.replaceChildren(renderBody(body.dataset["rawText"] ?? ""));
    }
}

function append(node: HTMLElement): void {
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    if (ctx.fadeMs > 0) {
        window.setTimeout(() => {
            node.classList.add("fade-out");
            window.setTimeout(() => node.remove(), 400);
        }, ctx.fadeMs);
    }
}

export function addMessage(from: string, text: string, msgid?: string): void {
    const line = document.createElement("div");
    line.className = "msg";
    if (msgid) line.dataset["msgid"] = msgid;
    const badges = buildBadges(from);
    if (badges.length) line.append(...badges);
    const who = document.createElement("span");
    who.className = "nick";
    who.textContent = from;
    who.style.color = hashColor(from);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}
