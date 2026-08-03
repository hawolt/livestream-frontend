import { expect, test } from "bun:test";
import { countChar, cssEsc, hashColor, splitTrailingPunctuation, textMentionsUsername, truncate } from "../src/chat/text.ts";

test("truncate leaves short strings untouched and ellipsizes long ones", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell…");
});

test("cssEsc falls back to escaping unsafe characters without the CSS global", () => {
    expect(typeof CSS).toBe("undefined");
    expect(cssEsc("msg id:123 !")).toBe("msg\\20 id\\3a 123\\20 \\21 ");
    expect(cssEsc("abc-DEF_123")).toBe("abc-DEF_123");
});

test("cssEsc fallback keeps distinct inputs distinct instead of collapsing them", () => {
    expect(cssEsc("ab.c")).not.toBe(cssEsc("abc"));
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

test("textMentionsUsername matches a whole-token mention with word boundaries", () => {
    expect(textMentionsUsername("hi @alice how are you", "alice")).toBe(true);
    expect(textMentionsUsername("hi @alice2", "alice")).toBe(false);
    expect(textMentionsUsername("hi @al", "alice")).toBe(false);
});

test("textMentionsUsername is case-insensitive", () => {
    expect(textMentionsUsername("hey @ALICE", "alice")).toBe(true);
    expect(textMentionsUsername("hey @Alice", "ALICE")).toBe(true);
});

test("textMentionsUsername ignores an @ that appears inside another token", () => {
    expect(textMentionsUsername("email me at me@alice.com", "alice")).toBe(false);
    expect(textMentionsUsername("foo@alice", "alice")).toBe(false);
});

test("textMentionsUsername returns true once even with multiple mentions", () => {
    expect(textMentionsUsername("@alice @alice are you there @alice", "alice")).toBe(true);
});

test("textMentionsUsername strips trailing punctuation off the mention", () => {
    expect(textMentionsUsername("hey @alice!", "alice")).toBe(true);
    expect(textMentionsUsername("hey @alice,", "alice")).toBe(true);
});

test("textMentionsUsername returns false for an empty username", () => {
    expect(textMentionsUsername("hey @alice", "")).toBe(false);
});
