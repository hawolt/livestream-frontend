import { ctx, NO_CATEGORY_LABEL, type CategorySelector, type ExploreStream } from "./context.ts";
import { compareCategoryCards } from "./category-sort.ts";
import { drillEl, drillTitleEl } from "./dom.ts";
import { hideEmpty, renderStreamList, setGridChildren, setGridPortrait, showEmpty, viewersIcon } from "./stream-cards.ts";
import { urlFor } from "./url-state.ts";

interface CategoryCardData {
    id: CategorySelector;
    name: string;
    viewers: number;
    count: number;
    imageUrl?: string | null;
}

function categoryCardEl(data: CategoryCardData): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "explore-card explore-category-card";
    a.href = urlFor("categories", data.id, data.name);
    a.dataset["categoryId"] = String(data.id);
    a.dataset["categoryName"] = data.name;

    const thumb = document.createElement("div");
    thumb.className = "explore-thumb explore-category-thumb";
    const nameEl = document.createElement("div");
    nameEl.className = "explore-category-name";
    nameEl.textContent = data.name;
    const chip = document.createElement("span");
    chip.className = "explore-tag";
    chip.textContent = data.name;
    const noArt = data.id === "none" || data.name.trim().toLowerCase() === "other";
    if (!noArt && data.imageUrl) {
        const img = document.createElement("img");
        img.className = "explore-category-art";
        img.src = data.imageUrl;
        img.alt = data.name;
        img.loading = "lazy";
        img.onerror = () => {
            img.remove();
            nameEl.hidden = false;
        };
        nameEl.hidden = true;
        thumb.append(img, chip, nameEl);
    } else {
        thumb.append(chip, nameEl);
    }

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

function renderCategoryGrid(): void {
    drillEl.classList.add("hidden");
    setGridPortrait(true);
    const noCategory = ctx.streams.filter(s => s.categoryId === null);
    const cards: CategoryCardData[] = ctx.categories.map(c => ({ id: c.id, name: c.name, viewers: c.viewerCount, count: c.liveStreamCount, imageUrl: c.imageUrl }));
    if (noCategory.length) {
        cards.push({ id: "none", name: NO_CATEGORY_LABEL, viewers: noCategory.reduce((sum, s) => sum + s.viewers, 0), count: noCategory.length });
    }
    if (!cards.length) {
        setGridChildren([]);
        showEmpty("No categories yet");
        return;
    }
    hideEmpty();
    cards.sort(compareCategoryCards);
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
