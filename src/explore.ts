import { initSiteNav } from "./nav.ts";

interface ExploreStream {
    username: string;
    title: string;
    category: string | null;
    categoryId: number | null;
    viewers: number;
    mediaBase?: string;
}

interface ExploreCategory {
    id: number;
    name: string;
    liveStreamCount: number;
    viewerCount: number;
}

type Mode = "streams" | "categories";
type CategorySelector = number | "none" | "invalid" | null;

interface ViewState {
    mode: Mode;
    categoryId: CategorySelector;
}

interface CategoryCardData {
    id: CategorySelector;
    name: string;
    viewers: number;
    count: number;
}

interface StreamCard {
    username: string;
    root: HTMLDivElement;
    link: HTMLAnchorElement;
    image: HTMLImageElement;
}

interface StreamPreview {
    card: StreamCard;
    layer: HTMLDivElement;
    frame: HTMLIFrameElement;
    status: HTMLSpanElement;
}

const page = document.getElementById("explore-page") as HTMLElement;
const gridEl = document.getElementById("explore-grid") as HTMLElement;
const emptyEl = document.getElementById("explore-empty") as HTMLElement;
const drillEl = document.getElementById("explore-drill") as HTMLElement;
const drillTitleEl = document.getElementById("explore-drill-title") as HTMLElement;
const backBtn = document.getElementById("explore-back") as HTMLButtonElement;
const modeStreamsBtn = document.getElementById("mode-streams") as HTMLButtonElement;
const modeCategoriesBtn = document.getElementById("mode-categories") as HTMLButtonElement;

const POLL_MS = 10000;
const PREVIEW_DELAY_MS = 300;
const PREVIEW_MESSAGE_TYPE = "hawolt:stream-preview";
const NO_CATEGORY_LABEL = "No category";

let streams: ExploreStream[] = [];
let categories: ExploreCategory[] = [];
let mode: Mode = "streams";
let drillCategoryId: CategorySelector = null;
let mediaBase = "";
let previewTimer: number | null = null;
let pendingPreview: StreamCard | null = null;
let activePreview: StreamPreview | null = null;
let deferredGridChildren: HTMLElement[] | null = null;

const isFramed = window.self !== window.top || new URLSearchParams(location.search).get("framed") === "1";
const hoverPreviewMedia = window.matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)");

function thumbUrl(s: ExploreStream): string {
    const minute = Math.floor(Date.now() / 60000);
    const base = typeof s.mediaBase === "string" ? s.mediaBase.replace(/\/+$/, "") : mediaBase;
    return `${base}/thumb/${encodeURIComponent(s.username)}.jpg?t=${minute}`;
}

function viewersIcon(): string {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="7.2" r="4.2"/><path d="M12 13.4c-4.8 0-8 2.6-8 6.6h16c0-4-3.2-6.6-8-6.6z"/></svg>`;
}

const streamCards = new Map<string, StreamCard>();

function updateStreamThumbnail(card: StreamCard, s: ExploreStream): void {
    const img = card.image;
    const src = thumbUrl(s);
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
    if (title) title.textContent = s.title ? s.title : "No title";
    updateStreamThumbnail(card, s);
}

function clearPendingPreview(): void {
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }
    pendingPreview = null;
}

function applyDeferredGrid(): void {
    const deferred = deferredGridChildren;
    deferredGridChildren = null;
    if (deferred) setGridChildren(deferred);
}

function stopStreamPreview(card?: StreamCard): void {
    const stopsPending = !card || pendingPreview === card;
    if (stopsPending) clearPendingPreview();
    const preview = activePreview;
    if (!preview || (card && preview.card !== card)) {
        if (stopsPending) applyDeferredGrid();
        return;
    }
    activePreview = null;
    preview.card.root.classList.remove("preview-connecting", "preview-playing");
    preview.layer.remove();
    const stream = streams.find((item) => item.username === preview.card.username);
    if (stream) updateStreamThumbnail(preview.card, stream);
    applyDeferredGrid();
}

function startStreamPreview(card: StreamCard): void {
    if (!card.root.isConnected || !hoverPreviewMedia.matches) return;
    const frame = document.createElement("iframe");
    frame.className = "explore-preview-frame";
    frame.src = `/embed/${encodeURIComponent(card.username)}?preview=1`;
    frame.allow = "autoplay";
    frame.tabIndex = -1;
    frame.title = `${card.username} muted stream preview`;
    frame.setAttribute("aria-hidden", "true");

    const status = document.createElement("span");
    status.className = "explore-preview-status";
    status.textContent = "Connecting preview";
    status.setAttribute("aria-hidden", "true");

    const layer = document.createElement("div");
    layer.className = "explore-preview-layer";
    layer.append(frame, status);

    card.root.classList.add("preview-connecting");
    activePreview = { card, layer, frame, status };
    card.root.appendChild(layer);
}

function queueStreamPreview(card: StreamCard): void {
    if (!hoverPreviewMedia.matches || pendingPreview === card || activePreview?.card === card) return;
    stopStreamPreview();
    pendingPreview = card;
    previewTimer = window.setTimeout(() => {
        previewTimer = null;
        if (pendingPreview !== card) return;
        pendingPreview = null;
        startStreamPreview(card);
    }, PREVIEW_DELAY_MS);
}

function buildStreamCard(s: ExploreStream): StreamCard {
    const root = document.createElement("div");
    root.className = "explore-stream-card";
    const a = document.createElement("a");
    a.className = "explore-card";
    a.href = `/${encodeURIComponent(s.username)}`;
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
    const title = document.createElement("div");
    title.className = "explore-card-title";
    body.append(title, username);
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

function setGridChildren(children: HTMLElement[]): void {
    const current = Array.from(gridEl.children);
    if (current.length === children.length && current.every((child, index) => child === children[index])) {
        deferredGridChildren = null;
        return;
    }
    const previewCard = activePreview?.card ?? pendingPreview;
    if (previewCard && children.includes(previewCard.root)) {
        deferredGridChildren = [...children];
        return;
    }
    deferredGridChildren = null;
    stopStreamPreview();
    gridEl.replaceChildren(...children);
}

function renderStreamList(list: ExploreStream[]): void {
    const live = new Set(streams.map((s) => s.username));
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

function urlFor(m: Mode, catId: CategorySelector): string {
    if (m === "categories" && (catId === "none" || typeof catId === "number")) {
        return `/?category=${catId}`;
    }
    return "/";
}

function categoryCardEl(data: CategoryCardData): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "explore-card explore-category-card";
    a.href = urlFor("categories", data.id);
    a.dataset["categoryId"] = String(data.id);

    const thumb = document.createElement("div");
    thumb.className = "explore-thumb explore-category-thumb";
    const nameEl = document.createElement("div");
    nameEl.className = "explore-category-name";
    nameEl.textContent = data.name;
    thumb.appendChild(nameEl);

    const body = document.createElement("div");
    body.className = "explore-card-body";
    const meta = document.createElement("div");
    meta.className = "explore-card-meta";

    const viewers = document.createElement("span");
    viewers.className = "explore-viewers";
    viewers.innerHTML = viewersIcon();
    const viewersCount = document.createElement("span");
    viewersCount.textContent = data.viewers.toLocaleString();
    viewers.appendChild(viewersCount);

    const tag = document.createElement("span");
    tag.className = "explore-tag";
    tag.textContent = `${data.count} stream${data.count === 1 ? "" : "s"}`;

    meta.append(viewers, tag);
    body.appendChild(meta);
    a.append(thumb, body);
    return a;
}

function showEmpty(text: string): void {
    emptyEl.textContent = text;
    emptyEl.classList.remove("hidden");
}

function hideEmpty(): void {
    emptyEl.classList.add("hidden");
}

function updateModeButtons(): void {
    modeStreamsBtn.classList.toggle("active", mode === "streams");
    modeCategoriesBtn.classList.toggle("active", mode === "categories");
}

function renderStreamsMode(): void {
    drillEl.classList.add("hidden");
    if (!streams.length) {
        setGridChildren([]);
        showEmpty("No one is live right now");
        return;
    }
    hideEmpty();
    renderStreamList(streams);
}

function renderCategoryGrid(): void {
    drillEl.classList.add("hidden");
    const noCategory = streams.filter(s => s.categoryId === null);
    const cards: CategoryCardData[] = categories.map(c => ({ id: c.id, name: c.name, viewers: c.viewerCount, count: c.liveStreamCount }));
    if (noCategory.length) {
        cards.push({ id: "none", name: NO_CATEGORY_LABEL, viewers: noCategory.reduce((sum, s) => sum + s.viewers, 0), count: noCategory.length });
    }
    if (!cards.length) {
        setGridChildren([]);
        showEmpty("No categories yet");
        return;
    }
    hideEmpty();
    cards.sort((a, b) => b.viewers - a.viewers);
    setGridChildren(cards.map(categoryCardEl));
}

function renderCategoryDrill(name: string, list: ExploreStream[]): void {
    drillEl.classList.remove("hidden");
    drillTitleEl.textContent = name;
    if (!list.length) {
        setGridChildren([]);
        showEmpty("No one is streaming in this category right now");
        return;
    }
    hideEmpty();
    renderStreamList(list);
}

function renderCategoryNotFound(): void {
    drillEl.classList.remove("hidden");
    drillTitleEl.textContent = "Category not found";
    setGridChildren([]);
    showEmpty("This category does not exist.");
}

function renderCategoriesMode(): void {
    const catId = drillCategoryId;
    if (catId === null) {
        renderCategoryGrid();
        return;
    }
    if (catId === "invalid") {
        renderCategoryNotFound();
        return;
    }
    if (catId === "none") {
        renderCategoryDrill(NO_CATEGORY_LABEL, streams.filter(s => s.categoryId === null));
        return;
    }
    const cat = categories.find(c => c.id === catId);
    if (!cat) {
        renderCategoryNotFound();
        return;
    }
    renderCategoryDrill(cat.name, streams.filter(s => s.categoryId === cat.id));
}

function render(): void {
    updateModeButtons();
    if (mode === "streams") {
        renderStreamsMode();
        return;
    }
    renderCategoriesMode();
}

function applyState(state: ViewState): void {
    mode = state.mode;
    drillCategoryId = state.categoryId;
    render();
}

function navigate(next: ViewState): void {
    const url = urlFor(next.mode, next.categoryId);
    history.pushState(next, "", url);
    applyState(next);
}

function stateFromLocation(): ViewState {
    const raw = new URLSearchParams(location.search).get("category");
    if (raw === null) return { mode: "streams", categoryId: null };
    if (raw === "none") return { mode: "categories", categoryId: "none" };
    if (/^\d+$/.test(raw)) return { mode: "categories", categoryId: Number(raw) };
    return { mode: "categories", categoryId: "invalid" };
}

modeStreamsBtn.addEventListener("click", () => {
    if (mode === "streams") return;
    navigate({ mode: "streams", categoryId: null });
});

modeCategoriesBtn.addEventListener("click", () => {
    if (mode === "categories" && drillCategoryId === null) return;
    navigate({ mode: "categories", categoryId: null });
});

backBtn.addEventListener("click", () => {
    if (mode === "categories" && drillCategoryId === null) return;
    navigate({ mode: "categories", categoryId: null });
});

gridEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>("a[data-category-id]");
    if (!anchor) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const raw = anchor.dataset["categoryId"] ?? "";
    const categoryId: CategorySelector = raw === "none" ? "none" : (/^\d+$/.test(raw) ? Number(raw) : "invalid");
    navigate({ mode: "categories", categoryId });
});

window.addEventListener("popstate", (e) => {
    const state = (e.state as ViewState | null) ?? stateFromLocation();
    applyState(state);
});

window.addEventListener("message", (e) => {
    const preview = activePreview;
    if (!preview || e.origin !== location.origin || e.source !== preview.frame.contentWindow) return;
    const data = e.data as { type?: unknown; state?: unknown };
    if (data?.type !== PREVIEW_MESSAGE_TYPE) return;
    if (data.state === "playing") {
        preview.card.root.classList.remove("preview-connecting");
        preview.card.root.classList.add("preview-playing");
        preview.status.textContent = "Muted preview";
        return;
    }
    preview.card.root.classList.remove("preview-playing");
    preview.card.root.classList.add("preview-connecting");
    preview.status.textContent = data.state === "unavailable" ? "Preview unavailable" : "Connecting preview";
});

window.addEventListener("pagehide", () => stopStreamPreview());

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopStreamPreview();
});

hoverPreviewMedia.addEventListener("change", () => {
    if (!hoverPreviewMedia.matches) stopStreamPreview();
});

async function poll(): Promise<void> {
    try {
        const res = await fetch("/api/live/explore");
        if (res.ok) {
            const data = await res.json();
            streams = Array.isArray(data.streams) ? data.streams : [];
            categories = Array.isArray(data.categories) ? data.categories : [];
            if (typeof data.mediaBase === "string") mediaBase = data.mediaBase.replace(/\/+$/, "");
            render();
        }
    } catch {}
}

async function boot(): Promise<void> {
    if (isFramed) document.body.classList.add("explore-framed");
    page.hidden = false;
    if (!isFramed) void initSiteNav("browse");
    const initial = stateFromLocation();
    mode = initial.mode;
    drillCategoryId = initial.categoryId;
    history.replaceState(initial, "", urlFor(initial.mode, initial.categoryId));
    updateModeButtons();
    await poll();
    setInterval(() => { void poll(); }, POLL_MS);
}

void boot();

export {};
