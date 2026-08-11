import { describe, expect, test } from "bun:test";
import { compareCategoryCards } from "../src/explore/category-sort.ts";

function card(name: string, viewers: number, count: number) {
    return { name, viewers, count };
}

describe("compareCategoryCards", () => {
    test("higher viewer count sorts first", () => {
        expect(compareCategoryCards(card("B", 10, 1), card("A", 5, 9))).toBeLessThan(0);
        expect(compareCategoryCards(card("A", 5, 9), card("B", 10, 1))).toBeGreaterThan(0);
    });

    test("equal viewers falls back to live stream count", () => {
        expect(compareCategoryCards(card("B", 10, 3), card("A", 10, 2))).toBeLessThan(0);
        expect(compareCategoryCards(card("A", 10, 2), card("B", 10, 3))).toBeGreaterThan(0);
    });

    test("equal viewers and count falls back to alphabetical", () => {
        expect(compareCategoryCards(card("Alpha", 10, 2), card("Beta", 10, 2))).toBeLessThan(0);
        expect(compareCategoryCards(card("Beta", 10, 2), card("Alpha", 10, 2))).toBeGreaterThan(0);
    });

    test("identical entries compare equal", () => {
        expect(compareCategoryCards(card("Same", 1, 1), card("Same", 1, 1))).toBe(0);
    });

    test("full ordering over a mixed list", () => {
        const list = [card("Zeta", 0, 0), card("Alpha", 0, 0), card("Mid", 5, 1), card("Mid2", 5, 2), card("Top", 9, 1)];
        list.sort(compareCategoryCards);
        expect(list.map(c => c.name)).toEqual(["Top", "Mid2", "Mid", "Alpha", "Zeta"]);
    });
});
