import { expect, test } from "bun:test";
import { countChar, cssEsc, hashColor, splitTrailingPunctuation, truncate } from "../src/chat/text.ts";

test("truncate leaves short strings untouched and ellipsizes long ones", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell…");
});

test("cssEsc falls back to stripping unsafe characters without the CSS global", () => {
    expect(typeof CSS).toBe("undefined");
    expect(cssEsc("msg id:123 !")).toBe("msgid123");
    expect(cssEsc("abc-DEF_123")).toBe("abc-DEF_123");
});

test("countChar counts only exact character matches", () => {
    expect(countChar("((()))", "(")).toBe(3);
    expect(countChar("((()))", ")")).toBe(3);
    expect(countChar("hello", "z")).toBe(0);
});

test("splitTrailingPunctuation strips ordinary trailing punctuation", () => {
    expect(splitTrailingPunctuation("hello!!!")).toEqual({ core: "hello", trail: "!!!" });
    expect(splitTrailingPunctuation("plain")).toEqual({ core: "plain", trail: "" });
});

test("splitTrailingPunctuation keeps a balanced closing bracket that belongs to the token", () => {
    expect(splitTrailingPunctuation("(hello)")).toEqual({ core: "(hello)", trail: "" });
});

test("splitTrailingPunctuation peels an unbalanced trailing closer used as sentence punctuation", () => {
    expect(splitTrailingPunctuation("see (this)")).toEqual({ core: "see (this)", trail: "" });
    expect(splitTrailingPunctuation("(see this")).toEqual({ core: "(see this", trail: "" });
    expect(splitTrailingPunctuation("see this)")).toEqual({ core: "see this", trail: ")" });
});

test("splitTrailingPunctuation handles nested and mixed closers left to right", () => {
    expect(splitTrailingPunctuation("[a(b)]!")).toEqual({ core: "[a(b)]", trail: "!" });
    expect(splitTrailingPunctuation("a]}")).toEqual({ core: "a", trail: "]}" });
});

test("splitTrailingPunctuation stops at the first character that is not trailing punctuation", () => {
    expect(splitTrailingPunctuation("wow!?)")).toEqual({ core: "wow", trail: "!?)" });
});

test("hashColor is deterministic per name and stays within the hsl range", () => {
    expect(hashColor("alice")).toBe(hashColor("alice"));
    const match = /^hsl\((\d+), 65%, 68%\)$/.exec(hashColor("zzzzzzzzzzzzzzzzzzzz"));
    expect(match).not.toBeNull();
    const hue = Number(match![1]);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
});

test("hashColor differs for different names in the common case", () => {
    expect(hashColor("alice")).not.toBe(hashColor("bob"));
});
