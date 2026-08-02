import { emotes } from "./context.ts";
import { MENTION_RE, splitTrailingPunctuation } from "./text.ts";

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

function renderToken(token: string): Node {
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
        if (!trail) return buildLinkAnchor(core);
        const frag = document.createDocumentFragment();
        frag.appendChild(buildLinkAnchor(core));
        frag.appendChild(document.createTextNode(trail));
        return frag;
    }
    return document.createTextNode(token);
}

export function renderBody(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of text.split(/(\s+)/)) {
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
        const node = renderToken(token);
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

export const RENDERED_BODY_CLASS = "live-chat-rendered-body";

export function buildRenderedBody(text: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    body.appendChild(renderBody(text));
    return body;
}
