import { emotes } from "./context.ts";
import { MENTION_RE, splitTrailingPunctuation } from "./text.ts";
import { currentChatHost, parseChatClipUrl } from "./clip-link.ts";
import { upgradeToClipCard } from "./clip-card.ts";
import { buildPersonalEmoteImg, parsePersonalEmoteTag, splicePersonalEmotes, type PersonalEmoteGroup } from "../chat-personal-emotes.ts";

const MAX_CLIP_CARDS_PER_MESSAGE = 2;

interface RenderBudget {
    clipCards: number;
}

export function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

export function parseServerTime(value: string | undefined): Date {
    if (value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) return parsed;
    }
    return new Date();
}

export function buildTimeSpan(sentAt?: string): HTMLSpanElement {
    const time = parseServerTime(sentAt);
    const span = document.createElement("span");
    span.className = "live-chat-time";
    span.textContent = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`;
    return span;
}

const AVATAR_USER_ID_RE = /^[0-9]+$/;
const AVATAR_EXT_RE = /^(jpg|png|gif)$/;

function buildAvatarFallback(from: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = "live-chat-avatar-fallback";
    span.textContent = from.slice(0, 1).toUpperCase();
    return span;
}

export function buildAvatar(from: string, userId?: string, avatar?: string): HTMLElement {
    if (userId && avatar && AVATAR_USER_ID_RE.test(userId) && AVATAR_EXT_RE.test(avatar)) {
        const img = document.createElement("img");
        img.className = "live-chat-avatar";
        img.src = `/api/live/avatar/${userId}.${avatar}`;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => {
            img.replaceWith(buildAvatarFallback(from));
        };
        return img;
    }
    return buildAvatarFallback(from);
}

export function buildEmoteImg(name: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "live-chat-emote";
    img.src = url;
    img.referrerPolicy = "no-referrer";
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    return img;
}

function parseLinkUrl(text: string): URL | null {
    if (!/^https?:\/\//i.test(text)) return null;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
}

function buildLinkAnchor(url: string): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow ugc";
    a.referrerPolicy = "no-referrer";
    a.className = "live-chat-link";
    a.textContent = url;
    return a;
}

function buildMention(name: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = "live-chat-mention";
    span.textContent = name;
    return span;
}

function buildLink(core: string, budget: RenderBudget): HTMLAnchorElement {
    const anchor = buildLinkAnchor(core);
    if (budget.clipCards <= 0) return anchor;
    const ref = parseChatClipUrl(core, currentChatHost());
    if (!ref) return anchor;
    budget.clipCards -= 1;
    upgradeToClipCard(anchor, ref);
    return anchor;
}

function renderToken(token: string, budget: RenderBudget): Node {
    const emoteUrl = emotes.get(token)?.url;
    if (emoteUrl) return buildEmoteImg(token, emoteUrl);
    const { core, trail } = splitTrailingPunctuation(token);
    if (core && MENTION_RE.test(core)) {
        if (!trail) return buildMention(core);
        const frag = document.createDocumentFragment();
        frag.append(buildMention(core), document.createTextNode(trail));
        return frag;
    }
    if (core && parseLinkUrl(core)) {
        if (!trail) return buildLink(core, budget);
        const frag = document.createDocumentFragment();
        frag.appendChild(buildLink(core, budget));
        frag.appendChild(document.createTextNode(trail));
        return frag;
    }
    return document.createTextNode(token);
}

function renderPlainSegment(segment: string, budget: RenderBudget): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of segment.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
            pendingWs += token;
            continue;
        }
        const emote = emotes.get(token);
        const url = emote?.url;
        if (url && emote.zeroWidth && lastStack) {
            const img = buildEmoteImg(token, url);
            img.classList.add("live-chat-emote-zw");
            lastStack.appendChild(img);
            pendingWs = "";
            continue;
        }
        if (pendingWs) {
            frag.appendChild(document.createTextNode(pendingWs));
            pendingWs = "";
        }
        const node = renderToken(token, budget);
        if (url) {
            const stack = document.createElement("span");
            stack.className = "live-chat-emote-stack";
            stack.appendChild(node);
            frag.appendChild(stack);
            lastStack = stack;
        } else {
            frag.appendChild(node);
            lastStack = null;
        }
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
    return frag;
}

export function renderBody(text: string, personalEmotes: PersonalEmoteGroup[] = []): DocumentFragment {
    const budget: RenderBudget = { clipCards: MAX_CLIP_CARDS_PER_MESSAGE };
    return splicePersonalEmotes(
        text,
        personalEmotes,
        (segment) => renderPlainSegment(segment, budget),
        (name, id) => {
            const stack = document.createElement("span");
            stack.className = "live-chat-emote-stack";
            stack.appendChild(buildPersonalEmoteImg(name, id, "live-chat-emote"));
            return stack;
        },
    );
}

export const RENDERED_BODY_CLASS = "live-chat-rendered-body";

const personalEmotesByBody = new WeakMap<HTMLElement, PersonalEmoteGroup[]>();

export function buildRenderedBody(text: string, personalEmotesTag?: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    const groups = parsePersonalEmoteTag(personalEmotesTag);
    if (groups.length) personalEmotesByBody.set(body, groups);
    body.appendChild(renderBody(text, groups));
    return body;
}

export function personalEmotesFor(body: HTMLElement): PersonalEmoteGroup[] {
    return personalEmotesByBody.get(body) ?? [];
}
