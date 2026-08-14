export type Mode = "streams" | "categories";
export type CategorySelector = number | "none" | "invalid" | null;

export interface ExploreStream {
    username: string;
    title: string;
    category: string | null;
    categoryId: number | null;
    language: string;
    viewers: number;
    mediaBase?: string;
    thumbnail?: string;
}

export interface ExploreCategory {
    id: number;
    name: string;
    liveStreamCount: number;
    viewerCount: number;
    imageUrl?: string | null;
}

export interface ViewState {
    mode: Mode;
    categoryId: CategorySelector;
    categoryName?: string;
}

export { NO_CATEGORY_LABEL } from "./url-state.ts";

export const isFramed = window.self !== window.top || new URLSearchParams(location.search).get("framed") === "1";

export const ctx = {
    streams: [] as ExploreStream[],
    categories: [] as ExploreCategory[],
    mode: "streams" as Mode,
    drillCategoryId: null as CategorySelector,
    mediaBase: "",
    languageFilter: "",
};
