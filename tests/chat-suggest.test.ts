import { expect, test } from "bun:test";
import { applyReplacement, wrapIndex } from "../src/chat-suggest.ts";

test("wrapIndex advances forward and wraps past the end", () => {
    expect(wrapIndex(0, 1, 3)).toBe(1);
    expect(wrapIndex(2, 1, 3)).toBe(0);
});

test("wrapIndex moves backward and wraps past the start", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(1, -1, 3)).toBe(0);
});

test("wrapIndex returns -1 for an empty list", () => {
    expect(wrapIndex(-1, 1, 0)).toBe(-1);
});

test("applyReplacement swaps the given range and reports the new range end", () => {
    const result = applyReplacement("hi :wav there", { start: 3, end: 7 }, "PogChamp ");
    expect(result.value).toBe("hi PogChamp  there");
    expect(result.end).toBe(12);
});

test("applyReplacement can re-replace its own previous output for cycling", () => {
    const first = applyReplacement("hi :wav there", { start: 3, end: 7 }, "PogChamp ");
    const second = applyReplacement(first.value, { start: 3, end: first.end }, "Kappa ");
    expect(second.value).toBe("hi Kappa  there");
    expect(second.end).toBe(9);
});
