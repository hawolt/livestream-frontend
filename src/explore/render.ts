import { renderCategoriesMode } from "./categories.ts";
import { ctx, type ViewState } from "./context.ts";
import { renderStreamsMode, updateModeButtons } from "./stream-cards.ts";
import { resolveCategoryName, urlFor } from "./url-state.ts";

export function render(): void {
    updateModeButtons();
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
