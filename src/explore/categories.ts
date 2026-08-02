import { ctx, NO_CATEGORY_LABEL, type CategorySelector, type ExploreStream } from "./context.ts";
import { drillEl, drillTitleEl } from "./dom.ts";
import { hideEmpty, renderStreamList, setGridChildren, showEmpty, viewersIcon } from "./stream-cards.ts";
import { urlFor } from "./url-state.ts";

interface CategoryCardData {
    id: CategorySelector;
    name: string;
    viewers: number;
    count: number;
}

interface CategoryCard {
    root: HTMLAnchorElement;
    name: HTMLElement;
    viewers: HTMLElement;
    tag: HTMLElement;
}

const categoryCards = new Map<string, CategoryCard>();

function categoryKey(id: CategorySelector): string {
    return id === null ? "null" : String(id);
}

function updateCategoryCard(card: CategoryCard, data: CategoryCardData): void {
    card.root.href = urlFor("categories", data.id);
    card.root.dataset["categoryId"] = String(data.id);
    card.name.textContent = data.name;
    card.viewers.textContent = data.viewers.toLocaleString();
    card.tag.textContent = `${data.count} stream${data.count === 1 ? "" : "s"}`;
}

function categoryCardEl(data: CategoryCardData): HTMLAnchorElement {
    const key = categoryKey(data.id);
    const existing = categoryCards.get(key);
    if (existing) {
        updateCategoryCard(existing, data);
        return existing.root;
    }
    const a = document.createElement("a");
    a.className = "explore-card explore-category-card";

    const thumb = document.createElement("div");
    thumb.className = "explore-thumb explore-category-thumb";
    const nameEl = document.createElement("div");
    nameEl.className = "explore-category-name";
    thumb.appendChild(nameEl);

    const body = document.createElement("div");
    body.className = "explore-card-body";
    const meta = document.createElement("div");
    meta.className = "explore-card-meta";

    const viewers = document.createElement("span");
    viewers.className = "explore-viewers";
    viewers.innerHTML = viewersIcon();
    const viewersCount = document.createElement("span");
    viewers.appendChild(viewersCount);

    const tag = document.createElement("span");
    tag.className = "explore-tag";

    meta.append(viewers, tag);
    body.appendChild(meta);
    a.append(thumb, body);
    const card = { root: a, name: nameEl, viewers: viewersCount, tag };
    categoryCards.set(key, card);
    updateCategoryCard(card, data);
    return a;
}

function renderCategoryGrid(): void {
    drillEl.classList.add("hidden");
    const noCategory = ctx.streams.filter(s => s.categoryId === null);
    const cards: CategoryCardData[] = ctx.categories.map(c => ({ id: c.id, name: c.name, viewers: c.viewerCount, count: c.liveStreamCount }));
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
    const activeKeys = new Set(cards.map(card => categoryKey(card.id)));
    for (const key of categoryCards.keys()) {
        if (!activeKeys.has(key)) categoryCards.delete(key);
    }
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

export function renderCategoriesMode(): void {
    const catId = ctx.drillCategoryId;
    if (catId === null) {
        renderCategoryGrid();
        return;
    }
    if (catId === "invalid") {
        renderCategoryNotFound();
        return;
    }
    if (catId === "none") {
        renderCategoryDrill(NO_CATEGORY_LABEL, ctx.streams.filter(s => s.categoryId === null));
        return;
    }
    const cat = ctx.categories.find(c => c.id === catId);
    if (!cat) {
        renderCategoryNotFound();
        return;
    }
    renderCategoryDrill(cat.name, ctx.streams.filter(s => s.categoryId === cat.id));
}
