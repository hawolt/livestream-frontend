import { describe, expect, test } from "bun:test";
import { NO_CATEGORY_LABEL, parseViewState, resolveCategoryName, urlFor } from "../src/explore/url-state.ts";

const cats = [
    { id: 3, name: "Just Chatting" },
    { id: 7, name: "Half/Life" },
    { id: 9, name: "Café" },
];

describe("urlFor", () => {
    test("streams mode always points at the root", () => {
        expect(urlFor("streams", null)).toBe("/");
        expect(urlFor("streams", 5)).toBe("/");
    });

    test("categories drill with a name builds a path url", () => {
        expect(urlFor("categories", 3, "Just Chatting")).toBe("/category/Just%20Chatting");
    });

    test("slashes and unicode in names are percent encoded", () => {
        expect(urlFor("categories", 7, "Half/Life")).toBe("/category/Half%2FLife");
        expect(urlFor("categories", 9, "Café")).toBe("/category/Caf%C3%A9");
        expect(urlFor("categories", 9, "100%")).toBe("/category/100%25");
    });

    test("the none drill uses the no-category label", () => {
        expect(urlFor("categories", "none", NO_CATEGORY_LABEL)).toBe("/category/Other");
    });

    test("categories mode without a usable name builds the grid url", () => {
        expect(urlFor("categories", null)).toBe("/categories");
        expect(urlFor("categories", 42)).toBe("/categories");
        expect(urlFor("categories", 42, "   ")).toBe("/categories");
        expect(urlFor("categories", "invalid", "x")).toBe("/categories");
    });

    test("names are trimmed before encoding", () => {
        expect(urlFor("categories", 3, "  Just Chatting  ")).toBe("/category/Just%20Chatting");
    });
});

describe("parseViewState paths", () => {
    test("root path with no query is streams mode", () => {
        expect(parseViewState("/", "")).toEqual({ mode: "streams", categoryId: null });
    });

    test("/categories is the grid, with and without a trailing slash", () => {
        expect(parseViewState("/categories", "")).toEqual({ mode: "categories", categoryId: null });
        expect(parseViewState("/categories/", "")).toEqual({ mode: "categories", categoryId: null });
    });

    test("/category without a name is the grid", () => {
        expect(parseViewState("/category", "")).toEqual({ mode: "categories", categoryId: null });
        expect(parseViewState("/category/", "")).toEqual({ mode: "categories", categoryId: null });
    });

    test("a category path decodes the name", () => {
        expect(parseViewState("/category/Just%20Chatting", "")).toEqual({ mode: "categories", categoryId: null, categoryName: "Just Chatting" });
    });

    test("encoded and literal slashes both decode to the same name", () => {
        expect(parseViewState("/category/Half%2FLife", "")).toEqual({ mode: "categories", categoryId: null, categoryName: "Half/Life" });
        expect(parseViewState("/category/Half/Life", "")).toEqual({ mode: "categories", categoryId: null, categoryName: "Half/Life" });
    });

    test("unicode names decode", () => {
        expect(parseViewState("/category/Caf%C3%A9", "")).toEqual({ mode: "categories", categoryId: null, categoryName: "Café" });
    });

    test("malformed percent encoding falls back to the grid", () => {
        expect(parseViewState("/category/%E0%A4%A", "")).toEqual({ mode: "categories", categoryId: null });
    });

    test("the path wins over a legacy query", () => {
        expect(parseViewState("/category/Just%20Chatting", "?category=9")).toEqual({ mode: "categories", categoryId: null, categoryName: "Just Chatting" });
    });
});

describe("parseViewState legacy queries", () => {
    test("no category param on the root means streams mode", () => {
        expect(parseViewState("/", "")).toEqual({ mode: "streams", categoryId: null });
    });

    test("category=none means the uncategorized drill", () => {
        expect(parseViewState("/", "?category=none")).toEqual({ mode: "categories", categoryId: "none" });
    });

    test("numeric category id parses to a number", () => {
        expect(parseViewState("/", "?category=7")).toEqual({ mode: "categories", categoryId: 7 });
    });

    test("non-numeric category id parses as invalid", () => {
        expect(parseViewState("/", "?category=abc")).toEqual({ mode: "categories", categoryId: "invalid" });
    });

    test("view=categories means the categories root", () => {
        expect(parseViewState("/", "?view=categories")).toEqual({ mode: "categories", categoryId: null });
    });
});

describe("resolveCategoryName", () => {
    test("exact name resolves to the id", () => {
        expect(resolveCategoryName("Just Chatting", cats)).toBe(3);
    });

    test("matching is case-insensitive", () => {
        expect(resolveCategoryName("JUST chatting", cats)).toBe(3);
    });

    test("names are trimmed before matching", () => {
        expect(resolveCategoryName("  Just Chatting  ", cats)).toBe(3);
    });

    test("the no-category label resolves to none regardless of case", () => {
        expect(resolveCategoryName("Other", cats)).toBe("none");
        expect(resolveCategoryName("oTHer", cats)).toBe("none");
    });

    test("the legacy no-category label keeps resolving to none", () => {
        expect(resolveCategoryName("No category", cats)).toBe("none");
        expect(resolveCategoryName("no CATEGORY", cats)).toBe("none");
    });

    test("a real category named Other wins over the synthetic bucket", () => {
        const withOther = [...cats, { id: 12, name: "Other" }];
        expect(resolveCategoryName("Other", withOther)).toBe(12);
        expect(resolveCategoryName("No category", withOther)).toBe("none");
    });

    test("substrings and unknown names resolve to null", () => {
        expect(resolveCategoryName("Just", cats)).toBeNull();
        expect(resolveCategoryName("UnknownGame", cats)).toBeNull();
    });

    test("empty input and empty category list resolve to null", () => {
        expect(resolveCategoryName("", cats)).toBeNull();
        expect(resolveCategoryName("   ", cats)).toBeNull();
        expect(resolveCategoryName("Just Chatting", [])).toBeNull();
    });
});

describe("round trips", () => {
    test("drill url round trips through parse and resolve", () => {
        const url = urlFor("categories", 7, "Half/Life");
        const state = parseViewState(url, "");
        expect(state.categoryName).toBe("Half/Life");
        expect(resolveCategoryName(state.categoryName ?? "", cats)).toBe(7);
    });

    test("grid url round trips", () => {
        const url = urlFor("categories", null);
        expect(url).toBe("/categories");
        expect(parseViewState(url, "")).toEqual({ mode: "categories", categoryId: null });
    });

    test("none drill round trips", () => {
        const url = urlFor("categories", "none", NO_CATEGORY_LABEL);
        const state = parseViewState(url, "");
        expect(resolveCategoryName(state.categoryName ?? "", cats)).toBe("none");
    });
});
