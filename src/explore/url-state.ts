import type { CategorySelector, Mode, ViewState } from "./context.ts";

export function urlFor(mode: Mode, catId: CategorySelector): string {
    if (mode === "categories" && (catId === "none" || typeof catId === "number")) {
        return `/?category=${catId}`;
    }
    if (mode === "categories" && catId === null) return "/?view=categories";
    return "/";
}

export function parseViewState(search: string): ViewState {
    const params = new URLSearchParams(search);
    const raw = params.get("category");
    if (raw === null) {
        if (params.get("view") === "categories") return { mode: "categories", categoryId: null };
        return { mode: "streams", categoryId: null };
    }
    if (raw === "none") return { mode: "categories", categoryId: "none" };
    if (/^\d+$/.test(raw)) return { mode: "categories", categoryId: Number(raw) };
    return { mode: "categories", categoryId: "invalid" };
}

export function stateFromLocation(): ViewState {
    return parseViewState(location.search);
}
