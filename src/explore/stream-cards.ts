import { streamLanguageLabel } from "../stream-languages.ts";
import { ctx, isFramed, NO_CATEGORY_LABEL, type ExploreStream } from "./context.ts";
import { drillEl, emptyEl, gridEl, modeCategoriesBtn, modeStreamsBtn } from "./dom.ts";
import { previewCardInFlight, queueStreamPreview, stopStreamPreview } from "./preview.ts";
import { buildThumbUrl } from "./thumb-url.ts";

export interface StreamCard {
    username: string;
    root: HTMLDivElement;
    link: HTMLAnchorElement;
    image: HTMLImageElement;
}

const thumbCacheKey = Math.floor(Date.now() / 60000);

export function viewersIcon(): string {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="7.2" r="4.2"/><path d="M12 13.4c-4.8 0-8 2.6-8 6.6h16c0-4-3.2-6.6-8-6.6z"/></svg>`;
}

const streamCards = new Map<string, StreamCard>();

export function updateStreamThumbnail(card: StreamCard, s: ExploreStream): void {
    const img = card.image;
    const src = buildThumbUrl(s.username, s.mediaBase, ctx.mediaBase, thumbCacheKey);
    if (img.dataset["thumbSrc"] === src) return;
    img.dataset["thumbSrc"] = src;
    img.style.removeProperty("display");
    img.src = src;
}

function updateStreamCard(card: StreamCard, s: ExploreStream): void {
    const tag = card.link.querySelector(".explore-tag");
    if (tag) tag.textContent = s.category ?? NO_CATEGORY_LABEL;
    const viewersText = card.link.querySelector(".explore-viewers span");
    if (viewersText) viewersText.textContent = `${s.viewers.toLocaleString()} viewers`;
    const title = card.link.querySelector(".explore-card-title");
    if (title) {
        const text = s.title ? s.title : "No title";
        title.textContent = text;
        title.setAttribute("title", text);
    }
    const language = card.link.querySelector<HTMLElement>(".explore-card-language");
    const languageLabel = streamLanguageLabel(s.language);
    if (language) {
        language.textContent = languageLabel ?? "";
        language.hidden = languageLabel === null;
    }
    updateStreamThumbnail(card, s);
}

function buildStreamCard(s: ExploreStream): StreamCard {
    const root = document.createElement("div");
    root.className = "explore-stream-card";
    const a = document.createElement("a");
    a.className = "explore-card";
    a.href = `/${encodeURIComponent(s.username.toLowerCase())}`;
    if (isFramed) a.target = "_top";
    const thumb = document.createElement("div");
    thumb.className = "explore-thumb";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.addEventListener("error", () => { img.style.display = "none"; });
    img.addEventListener("load", () => { img.style.removeProperty("display"); });
    const tag = document.createElement("span");
    tag.className = "explore-tag";
    const viewers = document.createElement("span");
    viewers.className = "explore-viewers";
    viewers.innerHTML = viewersIcon();
    viewers.appendChild(document.createElement("span"));
    thumb.append(img, tag, viewers);
    const body = document.createElement("div");
    body.className = "explore-card-body";
    const username = document.createElement("div");
    username.className = "explore-card-username";
    username.textContent = s.username;
    const language = document.createElement("span");
    language.className = "explore-card-language";
    const identity = document.createElement("div");
    identity.className = "explore-card-identity";
    identity.append(username, language);
    const title = document.createElement("div");
    title.className = "explore-card-title";
    body.append(title, identity);
    a.append(thumb, body);
    root.appendChild(a);

    const card = { username: s.username, root, link: a, image: img };
    thumb.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") queueStreamPreview(card);
    });
    thumb.addEventListener("pointerleave", () => stopStreamPreview(card));
    updateStreamCard(card, s);
    return card;
}

let deferredGridChildren: HTMLElement[] | null = null;

export function applyDeferredGrid(): void {
    const deferred = deferredGridChildren;
    deferredGridChildren = null;
    if (deferred) setGridChildren(deferred);
}

export function setGridChildren(children: HTMLElement[]): void {
    const current = Array.from(gridEl.children);
    if (current.length === children.length && current.every((child, index) => child === children[index])) {
        deferredGridChildren = null;
        return;
    }
    const previewCard = previewCardInFlight();
    if (previewCard && children.includes(previewCard.root)) {
        deferredGridChildren = [...children];
        return;
    }
    deferredGridChildren = null;
    stopStreamPreview();
    gridEl.replaceChildren(...children);
}

export function showEmpty(text: string): void {
    emptyEl.textContent = text;
    emptyEl.classList.remove("hidden");
}

export function hideEmpty(): void {
    emptyEl.classList.add("hidden");
}

export function updateModeButtons(): void {
    modeStreamsBtn.classList.toggle("active", ctx.mode === "streams");
    modeCategoriesBtn.classList.toggle("active", ctx.mode === "categories");
}

export function setGridPortrait(on: boolean): void {
    gridEl.classList.toggle("explore-grid-portrait", on);
}

export function renderStreamList(list: ExploreStream[]): void {
    setGridPortrait(false);
    const live = new Set(ctx.streams.map((s) => s.username));
    for (const key of Array.from(streamCards.keys())) {
        if (!live.has(key)) streamCards.delete(key);
    }
    const sorted = [...list].sort((a, b) => b.viewers - a.viewers);
    setGridChildren(sorted.map((s) => {
        let el = streamCards.get(s.username);
        if (el) {
            updateStreamCard(el, s);
        } else {
            el = buildStreamCard(s);
            streamCards.set(s.username, el);
        }
        return el.root;
    }));
}

export function renderStreamsMode(): void {
    drillEl.classList.add("hidden");
    if (!ctx.streams.length) {
        setGridChildren([]);
        showEmpty("No one is live right now");
        return;
    }
    hideEmpty();
    renderStreamList(ctx.streams);
}
