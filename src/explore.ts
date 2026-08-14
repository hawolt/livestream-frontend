import { createChannelRail } from "./channel-rail.ts";
import { initSiteNav } from "./nav.ts";
import { reportVisit } from "./visit-beacon.ts";
import { ctx, isFramed, NO_CATEGORY_LABEL, type CategorySelector, type ViewState } from "./explore/context.ts";
import { STREAM_LANGUAGE_OPTIONS } from "./stream-languages.ts";
import { attachTypeahead, type TypeaheadOption } from "./typeahead.ts";
import {
    backBtn,
    gridEl,
    languageFilterEl,
    modeCategoriesBtn,
    modeStreamsBtn,
    page,
    railCountEl,
    railEl,
    railListEl,
    railStatusEl,
    railToggleEl,
    railToggleGlyphEl,
} from "./explore/dom.ts";
import { loadExplore } from "./explore/poll.ts";
import { applyState, navigate, render } from "./explore/render.ts";
import { updateModeButtons } from "./explore/stream-cards.ts";
import { resolveCategoryName, stateFromLocation, urlFor } from "./explore/url-state.ts";

const MANUAL_REFRESH_THROTTLE_MS = 10000;
let lastManualRefresh = 0;
let railRefresh: (() => void) | null = null;

function refreshOnNavigation(): void {
    const now = Date.now();
    if (now - lastManualRefresh < MANUAL_REFRESH_THROTTLE_MS) return;
    lastManualRefresh = now;
    void loadExplore();
    railRefresh?.();
}

const languageFilterOptions: TypeaheadOption[] = [{ value: "", label: "Any language" }]
    .concat(STREAM_LANGUAGE_OPTIONS
        .filter(({ code }) => code !== "und")
        .map(({ code, label }) => ({ value: code, label })));
attachTypeahead(languageFilterEl, languageFilterOptions, (code) => {
    ctx.languageFilter = code;
    render();
}).setValue("");

modeStreamsBtn.addEventListener("click", () => {
    refreshOnNavigation();
    if (ctx.mode === "streams") return;
    navigate({ mode: "streams", categoryId: null });
});

modeCategoriesBtn.addEventListener("click", () => {
    refreshOnNavigation();
    if (ctx.mode === "categories" && ctx.drillCategoryId === null) return;
    navigate({ mode: "categories", categoryId: null });
});

backBtn.addEventListener("click", () => {
    refreshOnNavigation();
    if (ctx.mode === "categories" && ctx.drillCategoryId === null) return;
    navigate({ mode: "categories", categoryId: null });
});

gridEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>("a[data-category-id]");
    if (!anchor) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    refreshOnNavigation();
    const raw = anchor.dataset["categoryId"] ?? "";
    const categoryId: CategorySelector = raw === "none" ? "none" : (/^\d+$/.test(raw) ? Number(raw) : "invalid");
    navigate({ mode: "categories", categoryId, categoryName: anchor.dataset["categoryName"] });
});

window.addEventListener("popstate", (e) => {
    refreshOnNavigation();
    const state = (e.state as ViewState | null) ?? stateFromLocation();
    applyState(state);
});

function canonicalBootUrl(): string | null {
    const sel = ctx.drillCategoryId;
    if (ctx.mode !== "categories") return "/";
    if (sel === null) return "/categories";
    if (sel === "none") return urlFor("categories", "none", NO_CATEGORY_LABEL);
    if (sel === "invalid") return null;
    const cat = ctx.categories.find(c => c.id === sel);
    if (cat === undefined) return null;
    return urlFor("categories", sel, cat.name);
}

async function boot(): Promise<void> {
    if (isFramed) document.body.classList.add("explore-framed");
    page.hidden = false;
    if (!isFramed) {
        void initSiteNav("browse");
        reportVisit("explore");
    }
    const reportRailWidth = (): void => {
        window.parent.postMessage({ type: "itzon:rail-width", width: railEl.getBoundingClientRect().width }, location.origin);
    };
    const rail = createChannelRail({
        elements: {
            rail: railEl,
            toggle: railToggleEl,
            glyph: railToggleGlyphEl,
            list: railListEl,
            count: railCountEl,
            status: railStatusEl,
        },
        getActiveUsername: () => "",
        onCollapsedChange: isFramed ? reportRailWidth : undefined,
        linkTarget: isFramed ? "_top" : undefined,
    });
    rail.start();
    railRefresh = rail.refresh;
    lastManualRefresh = Date.now();
    if (isFramed) {
        requestAnimationFrame(reportRailWidth);
        window.addEventListener("resize", reportRailWidth);
        railToggleEl.addEventListener("click", () => {
            let last = -1;
            let stable = 0;
            const follow = (): void => {
                const width = railEl.getBoundingClientRect().width;
                reportRailWidth();
                if (Math.abs(width - last) < 0.5) stable += 1;
                else stable = 0;
                last = width;
                if (stable < 5) requestAnimationFrame(follow);
            };
            requestAnimationFrame(follow);
        });
    }
    const initial = stateFromLocation();
    ctx.mode = initial.mode;
    ctx.drillCategoryId = initial.categoryName === undefined ? initial.categoryId : null;
    updateModeButtons();
    await loadExplore();
    let keepUrl = false;
    if (initial.categoryName !== undefined) {
        const resolved = resolveCategoryName(initial.categoryName, ctx.categories);
        ctx.drillCategoryId = resolved;
        keepUrl = resolved === null;
        render();
    }
    if (!keepUrl) {
        const canonical = canonicalBootUrl();
        if (canonical !== null) {
            history.replaceState({ mode: ctx.mode, categoryId: ctx.drillCategoryId }, "", canonical);
        }
    }
}

void boot();

export {};
