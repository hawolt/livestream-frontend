import { renderCategoriesMode } from "./categories.ts";
import { ctx, isFramed, NO_CATEGORY_LABEL, type ViewState } from "./context.ts";
import { applyExploreSeo, exploreSeo } from "./seo.ts";
import { renderStreamsMode, updateModeButtons } from "./stream-cards.ts";
import { resolveCategoryName, urlFor } from "./url-state.ts";

function drilledCategoryName(): string | null {
    const selector = ctx.drillCategoryId;
    if (selector === null || selector === "invalid") return null;
    if (selector === "none") return NO_CATEGORY_LABEL;
    return ctx.categories.find(c => c.id === selector)?.name ?? null;
}

function syncSeo(): void {
    if (isFramed) return;
    applyExploreSeo(exploreSeo(ctx.mode, ctx.mode === "categories" ? drilledCategoryName() : null));
}

export function render(): void {
    updateModeButtons();
    syncSeo();
    if (ctx.mode === "streams") {
        renderStreamsMode();
        return;
    }
    renderCategoriesMode();
}

export function applyState(state: ViewState): void {
    ctx.mode = state.mode;
    ctx.drillCategoryId = state.categoryId === null && state.categoryName !== undefined
        ? resolveCategoryName(state.categoryName, ctx.categories)
        : state.categoryId;
    render();
}

export function navigate(next: ViewState): void {
    const url = urlFor(next.mode, next.categoryId, next.categoryName);
    history.pushState(next, "", url);
    applyState(next);
}
