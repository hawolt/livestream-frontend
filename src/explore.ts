import { initSiteNav } from "./nav.ts";
import { loadAds, renderAdSlot } from "./ads.ts";
import { ctx, isFramed, type CategorySelector, type ViewState } from "./explore/context.ts";
import { adEl, backBtn, gridEl, modeCategoriesBtn, modeStreamsBtn, page } from "./explore/dom.ts";
import { loadExplore } from "./explore/poll.ts";
import { applyState, navigate } from "./explore/render.ts";
import { updateModeButtons } from "./explore/stream-cards.ts";
import { stateFromLocation, urlFor } from "./explore/url-state.ts";

modeStreamsBtn.addEventListener("click", () => {
    if (ctx.mode === "streams") return;
    navigate({ mode: "streams", categoryId: null });
});

modeCategoriesBtn.addEventListener("click", () => {
    if (ctx.mode === "categories" && ctx.drillCategoryId === null) return;
    navigate({ mode: "categories", categoryId: null });
});

backBtn.addEventListener("click", () => {
    if (ctx.mode === "categories" && ctx.drillCategoryId === null) return;
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

async function boot(): Promise<void> {
    if (isFramed) document.body.classList.add("explore-framed");
    page.hidden = false;
    if (!isFramed) void initSiteNav("browse");
    const initial = stateFromLocation();
    ctx.mode = initial.mode;
    ctx.drillCategoryId = initial.categoryId;
    history.replaceState(initial, "", urlFor(initial.mode, initial.categoryId));
    updateModeButtons();
    await loadExplore();
    void loadAds("explore").then(ads => renderAdSlot(adEl, ads));
}

void boot();

export {};
