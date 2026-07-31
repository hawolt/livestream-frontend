import type { CategorySelector, Mode, ViewState } from "./context.ts";

export function urlFor(mode: Mode, catId: CategorySelector): string {
    if (mode === "categories" && (catId === "none" || typeof catId === "number")) {
        return `/?category=${catId}`;
    }
    return "/";
}

export function parseViewState(search: string): ViewState {
    const raw = new URLSearchParams(search).get("category");
    if (raw === null) return { mode: "streams", categoryId: null };
    if (raw === "none") return { mode: "categories", categoryId: "none" };
    if (/^\d+$/.test(raw)) return { mode: "categories", categoryId: Number(raw) };
    return { mode: "categories", categoryId: "invalid" };
}

export function stateFromLocation(): ViewState {
    return parseViewState(location.search);
}
