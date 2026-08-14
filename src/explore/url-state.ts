import type { CategorySelector, Mode, ViewState } from "./context.ts";

export const NO_CATEGORY_LABEL = "Other";
const LEGACY_NO_CATEGORY_LABEL = "no category";

export function urlFor(mode: Mode, catId: CategorySelector, name?: string): string {
    if (mode === "categories") {
        if ((catId === "none" || typeof catId === "number") && typeof name === "string" && name.trim() !== "") {
            return `/category/${encodeURIComponent(name.trim())}`;
        }
        return "/categories";
    }
    return "/";
}

export function resolveCategoryName(name: string, categories: { id: number; name: string }[]): number | "none" | null {
    const needle = name.trim().toLowerCase();
    if (needle === "") return null;
    const match = categories.find(c => c.name.toLowerCase() === needle);
    if (match !== undefined) return match.id;
    if (needle === NO_CATEGORY_LABEL.toLowerCase() || needle === LEGACY_NO_CATEGORY_LABEL) return "none";
    return null;
}

function parsePath(pathname: string): ViewState | null {
    const path = pathname.replace(/\/+$/, "");
    if (path === "/categories" || path === "/category") return { mode: "categories", categoryId: null };
    if (path.startsWith("/category/")) {
        const raw = path.slice("/category/".length);
        if (raw === "") return { mode: "categories", categoryId: null };
        try {
            return { mode: "categories", categoryId: null, categoryName: decodeURIComponent(raw) };
        } catch {
            return { mode: "categories", categoryId: null };
        }
    }
    return null;
}

export function parseViewState(pathname: string, search: string): ViewState {
    const fromPath = parsePath(pathname);
    if (fromPath !== null) return fromPath;
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
    return parseViewState(location.pathname, location.search);
}
