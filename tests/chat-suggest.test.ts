import { expect, test } from "bun:test";
import { applyReplacement, matchEmotes, matchMembers, suggestContextFor, wrapIndex } from "../src/chat/suggest-match.ts";

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

test("suggestContextFor requires at least two characters after an emote colon", () => {
    expect(suggestContextFor(":a", ":a", 0)).toBeNull();
    expect(suggestContextFor(":ab", ":ab", 0)).toEqual({ kind: "emote", term: "ab", withAt: false });
});

test("suggestContextFor accepts a single character after an at-mention", () => {
    expect(suggestContextFor("@", "@", 0)).toBeNull();
    expect(suggestContextFor("@a", "@a", 0)).toEqual({ kind: "member", term: "a", withAt: true });
});

test("suggestContextFor matches the first argument of a user-targeting command", () => {
    const value = ".ban alice";
    expect(suggestContextFor("alice", value, 5)).toEqual({ kind: "member", term: "alice", withAt: false });
});

test("suggestContextFor ignores a mid-message token that is not the command's first argument", () => {
    const value = ".ban alice bob";
    expect(suggestContextFor("bob", value, 11)).toBeNull();
});

test("suggestContextFor ignores unrecognized commands and plain tokens", () => {
    expect(suggestContextFor("alice", ".foo alice", 5)).toBeNull();
    expect(suggestContextFor("hello", "hello", 0)).toBeNull();
});

test("matchEmotes ranks prefix matches before substring matches, both alphabetized", () => {
    const names = ["kappapride", "pogchamp", "kappa", "kappahd"];
    expect(matchEmotes("kap", names)).toEqual(["kappa", "kappahd", "kappapride"]);
    expect(matchEmotes("og", names)).toEqual(["pogchamp"]);
});

test("matchEmotes caps results at the suggestion limit", () => {
    const names = Array.from({ length: 12 }, (_, i) => `kappa${i}`);
    expect(matchEmotes("kappa", names).length).toBe(8);
});

test("matchMembers ranks prefix matches before substring matches", () => {
    const members: [string, string][] = [
        ["alice", "Alice"],
        ["alicia", "Alicia"],
        ["bob", "Bob"],
        ["malice", "Malice"],
    ];
    expect(matchMembers("ali", members, "someone")).toEqual(["Alice", "Alicia", "Malice"]);
});

test("matchMembers excludes the requesting user even when their name would otherwise match", () => {
    const members: [string, string][] = [
        ["alice", "Alice"],
        ["bob", "Bob"],
    ];
    expect(matchMembers("alice", members, "alice")).toEqual([]);
});
