import { describe, expect, test } from "bun:test";
import { parseViewState, urlFor } from "../src/explore/url-state.ts";

describe("urlFor", () => {
    test("streams mode always points at the root", () => {
        expect(urlFor("streams", null)).toBe("/");
        expect(urlFor("streams", 5)).toBe("/");
    });

    test("categories mode with a numeric id builds a query", () => {
        expect(urlFor("categories", 42)).toBe("/?category=42");
    });

    test("categories mode with none builds the none query", () => {
        expect(urlFor("categories", "none")).toBe("/?category=none");
    });

    test("categories mode with null id builds the categories-root url", () => {
        expect(urlFor("categories", null)).toBe("/?view=categories");
    });

    test("categories mode with invalid id points at the root", () => {
        expect(urlFor("categories", "invalid")).toBe("/");
    });
});

describe("parseViewState", () => {
    test("no category param means streams mode", () => {
        expect(parseViewState("")).toEqual({ mode: "streams", categoryId: null });
    });

    test("category=none means the uncategorized drill", () => {
        expect(parseViewState("?category=none")).toEqual({ mode: "categories", categoryId: "none" });
    });

    test("numeric category id parses to a number", () => {
        expect(parseViewState("?category=7")).toEqual({ mode: "categories", categoryId: 7 });
    });

    test("non-numeric category id parses as invalid", () => {
        expect(parseViewState("?category=abc")).toEqual({ mode: "categories", categoryId: "invalid" });
    });

    test("view=categories means the categories root", () => {
        expect(parseViewState("?view=categories")).toEqual({ mode: "categories", categoryId: null });
    });
});

describe("categories-root round trip", () => {
    test("urlFor and parseViewState agree on the categories root", () => {
        const url = urlFor("categories", null);
        expect(url).toBe("/?view=categories");
        const query = url.slice(url.indexOf("?"));
        expect(parseViewState(query)).toEqual({ mode: "categories", categoryId: null });
    });
});
