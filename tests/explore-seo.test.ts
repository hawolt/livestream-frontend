import { describe, expect, test } from "bun:test";
import { exploreSeo } from "../src/explore/seo.ts";

describe("exploreSeo", () => {
    test("streams mode is the canonical homepage", () => {
        const seo = exploreSeo("streams", null);
        expect(seo.path).toBe("/");
        expect(seo.title).toBe("Watch live streams | ITZON");
        expect(seo.heading).toBe("Live streams on ITZON");
    });

    test("streams mode ignores a category name", () => {
        expect(exploreSeo("streams", "Just Chatting").path).toBe("/");
    });

    test("category grid canonicalizes to /categories", () => {
        const seo = exploreSeo("categories", null);
        expect(seo.path).toBe("/categories");
        expect(seo.title).toBe("Browse stream categories | ITZON");
        expect(seo.heading).toBe("Stream categories");
    });

    test("a blank category name falls back to the grid", () => {
        expect(exploreSeo("categories", "   ").path).toBe("/categories");
    });

    test("a drilled category gets its own title, heading and canonical", () => {
        const seo = exploreSeo("categories", "Just Chatting");
        expect(seo.path).toBe("/category/Just%20Chatting");
        expect(seo.title).toBe("Just Chatting live streams | ITZON");
        expect(seo.heading).toBe("Just Chatting live streams");
        expect(seo.description).toContain("Just Chatting");
    });

    test("a category name with a slash is percent encoded", () => {
        expect(exploreSeo("categories", "Rock/Metal").path).toBe("/category/Rock%2FMetal");
    });

    test("surrounding whitespace never reaches the canonical", () => {
        expect(exploreSeo("categories", "  Chess  ").path).toBe("/category/Chess");
    });
});
