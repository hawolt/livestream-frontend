import { streamLanguageLabel } from "../stream-languages.ts";
import { blursMatureThumbnail, type ViewerAge } from "../mature-decision.ts";
import { ctx, isFramed, NO_CATEGORY_LABEL, type ExploreStream } from "./context.ts";
import { filterStreamsByLanguage } from "./language-filter.ts";
import { drillEl, emptyEl, gridEl, modeCategoriesBtn, modeStreamsBtn } from "./dom.ts";
import { previewCardInFlight, queueStreamPreview, stopStreamPreview } from "./preview.ts";
import { thumbnailMinute } from "./thumbnail-minute.ts";
import { buildThumbUrl } from "./thumb-url.ts";

export interface StreamCard {
    username: string;
    root: HTMLDivElement;
    link: HTMLAnchorElement;
    image: HTMLImageElement;
}

export function viewersIcon(): string {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="7.2" r="4.2"/><path d="M12 13.4c-4.8 0-8 2.6-8 6.6h16c0-4-3.2-6.6-8-6.6z"/></svg>`;
}

export function partnerBadgeIcon(): string {
    return `<svg viewBox="0 0 32 32" width="14" height="14" role="img" aria-label="Partner"><g transform="rotate(45 16 16)"><rect x="4.7" y="4.7" width="22.6" height="22.6" rx="6" fill="var(--accent)"/></g><rect x="4.7" y="4.7" width="22.6" height="22.6" rx="6" fill="var(--accent)"/><path d="M10.4 16.7 L14.3 20.6 L21.7 12" stroke="var(--bg)" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const streamCards = new Map<string, StreamCard>();

export const MATURE_CARD_CLASS = "explore-card-mature";

let exploreViewerAge: ViewerAge = "unknown";

export function setExploreViewerAge(age: ViewerAge): void {
    exploreViewerAge = age;
}

export function applyMatureThumbnail(card: StreamCard, mature: boolean, age: ViewerAge): void {
    const blurred = blursMatureThumbnail(mature, age);
    card.root.classList.toggle(MATURE_CARD_CLASS, blurred);
    const badge = card.link.querySelector<HTMLElement>(".explore-mature-tag");
    if (badge) badge.hidden = !blurred;
}

export function updateStreamThumbnail(card: StreamCard, s: ExploreStream): void {
    const img = card.image;
    const src = buildThumbUrl(s.username, s.mediaBase, ctx.mediaBase, thumbnailMinute(), s.thumbnail);
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
    const partnerBadge = card.link.querySelector<HTMLElement>(".explore-card-partner-badge");
    if (partnerBadge) partnerBadge.hidden = !s.partner;
    card.image.alt = s.category
        ? `${s.username} streaming ${s.category} live`
        : `${s.username} streaming live`;
    const language = card.link.querySelector<HTMLElement>(".explore-card-language");
    const languageLabel = streamLanguageLabel(s.language);
    if (language) {
        language.textContent = languageLabel ?? "";
        language.hidden = languageLabel === null;
    }
    applyMatureThumbnail(card, s.mature, exploreViewerAge);
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
    const matureTag = document.createElement("span");
    matureTag.className = "explore-mature-tag";
    matureTag.textContent = "Mature";
    matureTag.hidden = true;
    thumb.append(img, tag, viewers, matureTag);
    const body = document.createElement("div");
    body.className = "explore-card-body";
    const username = document.createElement("div");
    username.className = "explore-card-username";
    username.textContent = s.username;
    const partnerBadge = document.createElement("span");
    partnerBadge.className = "explore-card-partner-badge";
    partnerBadge.innerHTML = partnerBadgeIcon();
    partnerBadge.title = "Partner";
    partnerBadge.hidden = true;
    const name = document.createElement("div");
    name.className = "explore-card-name";
    name.append(username, partnerBadge);
    const language = document.createElement("span");
    language.className = "explore-card-language";
    const identity = document.createElement("div");
    identity.className = "explore-card-identity";
    identity.append(name, language);
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
    const list = filterStreamsByLanguage(ctx.streams, ctx.languageFilter);
    if (!list.length) {
        setGridChildren([]);
        showEmpty("No live streams in this language right now");
        return;
    }
    hideEmpty();
    renderStreamList(list);
}
