import { renderCategoriesMode } from "./categories.ts";
import { ctx, type ViewState } from "./context.ts";
import { renderStreamsMode, updateModeButtons } from "./stream-cards.ts";
import { urlFor } from "./url-state.ts";

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
    ctx.drillCategoryId = state.categoryId;
    render();
}

export function navigate(next: ViewState): void {
    const url = urlFor(next.mode, next.categoryId);
    history.pushState(next, "", url);
    applyState(next);
}
