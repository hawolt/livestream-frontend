import { hashColor } from "../chat/text.ts";
import { sanitizeSubscriberBadgeName, subscriberBadgeAssetPath, subscriberBadgeTitle } from "../chat/badges.ts";
import type { BadgeRole } from "../chat/irc.ts";
import { buildPersonalEmoteImg, parsePersonalEmoteTag, splicePersonalEmotes, type PersonalEmoteGroup } from "../chat-personal-emotes.ts";
import { MAX_MESSAGES, RENDERED_BODY_CLASS, colors, ctx, emotes, isOwner, msgsEl, partners, roles, subscriberBadges, subscribers, unverified, vips, type Role } from "./context.ts";

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "partner" | "regular" | "unverified";

export interface BadgeSnapshot {
    role?: BadgeRole;
    vip?: boolean;
    partner?: boolean;
    subBadge?: string;
    unverified?: boolean;
}

export interface ResolvedBadges {
    role?: Role;
    owner: boolean;
    vip: boolean;
    partner: boolean;
    subBadgeName?: string;
    unverified: boolean;
}

function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    return img;
}

function makeSubscriberBadgeForName(rawName: string): HTMLImageElement {
    const name = sanitizeSubscriberBadgeName(rawName);
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

function hasRoleSnapshot(snapshot: BadgeSnapshot | undefined): boolean {
    return snapshot !== undefined && (snapshot.role !== undefined || snapshot.vip === true || snapshot.unverified === true);
}

export function resolveBadges(from: string, snapshot?: BadgeSnapshot): ResolvedBadges {
    const key = from.toLowerCase();
    const roleAware = hasRoleSnapshot(snapshot);
    const subBadge = snapshot?.subBadge;
    return {
        role: roleAware ? snapshot!.role : roles.get(key),
        owner: isOwner(from),
        vip: roleAware ? snapshot!.vip === true : vips.has(key),
        partner: snapshot?.partner ?? partners.has(key),
        subBadgeName: subBadge !== undefined
            ? sanitizeSubscriberBadgeName(subBadge)
            : (subscribers.has(key) ? sanitizeSubscriberBadgeName(subscriberBadges.get(key)) : undefined),
        unverified: roleAware ? snapshot!.unverified === true : unverified.has(key),
    };
}

export function renderBadges(resolved: ResolvedBadges): HTMLImageElement[] {
    const badges: HTMLImageElement[] = [];
    if (resolved.role === "staff") badges.push(makeBadge("staff"));
    if (resolved.owner) badges.push(makeBadge("op"));
    if (resolved.role === "bot") badges.push(makeBadge("bot"));
    if (resolved.role === "mod") badges.push(makeBadge("mod"));
    if (resolved.partner) badges.push(makeBadge("partner"));
    if (resolved.vip) badges.push(makeBadge("vip"));
    if (resolved.subBadgeName !== undefined) badges.push(makeSubscriberBadgeForName(resolved.subBadgeName));
    if (resolved.unverified) badges.push(makeBadge("unverified"));
    return badges;
}

function buildBadges(from: string, snapshot?: BadgeSnapshot): HTMLImageElement[] {
    if (!ctx.showBadges) return [];
    return renderBadges(resolveBadges(from, snapshot));
}

function buildOverlayEmote(token: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "emote";
    img.src = url;
    img.referrerPolicy = "no-referrer";
    img.alt = token;
    img.title = token;
    return img;
}

function renderPlainSegment(segment: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of segment.split(/(\s+)/)) {
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

function renderBody(text: string, personalEmotes: PersonalEmoteGroup[] = []): DocumentFragment {
    return splicePersonalEmotes(
        text,
        personalEmotes,
        (segment) => renderPlainSegment(segment),
        (name, id) => {
            const stack = document.createElement("span");
            stack.className = "emote-stack";
            stack.appendChild(buildPersonalEmoteImg(name, id, "emote"));
            return stack;
        },
    );
}

const personalEmotesByBody = new WeakMap<HTMLElement, PersonalEmoteGroup[]>();

function buildRenderedBody(text: string, personalEmotesTag?: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    const groups = parsePersonalEmoteTag(personalEmotesTag);
    if (groups.length) personalEmotesByBody.set(body, groups);
    body.appendChild(renderBody(text, groups));
    return body;
}

export function refreshEmoteRendering(): void {
    for (const body of Array.from(msgsEl.querySelectorAll<HTMLElement>(`.${RENDERED_BODY_CLASS}`))) {
        body.replaceChildren(renderBody(body.dataset["rawText"] ?? "", personalEmotesByBody.get(body) ?? []));
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

export function addMessage(from: string, text: string, msgid?: string, snapshot?: BadgeSnapshot, personalEmotes?: string): void {
    const line = document.createElement("div");
    line.className = "msg";
    if (msgid) line.dataset["msgid"] = msgid;
    const badges = buildBadges(from, snapshot);
    if (badges.length) line.append(...badges);
    const who = document.createElement("span");
    who.className = "nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text, personalEmotes));
    append(line);
}

export function addSystemMessage(text: string): void {
    const line = document.createElement("div");
    line.className = "msg sys";
    line.textContent = text;
    append(line);
}

function nickColor(from: string): string {
    const chosen = colors.get(from.toLowerCase());
    if (chosen && SAFE_COLOR.test(chosen)) return chosen;
    return hashColor(from);
}
