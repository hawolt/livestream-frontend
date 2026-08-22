import { expect, test } from "bun:test";
import { filterStreamsByLanguage } from "../src/explore/language-filter.ts";
import type { ExploreStream } from "../src/explore/context.ts";

function stream(username: string, language: string): ExploreStream {
    return { username, title: "", category: null, categoryId: null, language, viewers: 0, partner: false };
}

const STREAMS = [
    stream("a", "de"),
    stream("b", "fr,en"),
    stream("c", "und"),
    stream("d", "en"),
];

test("empty filter passes everything through unchanged", () => {
    expect(filterStreamsByLanguage(STREAMS, "")).toEqual(STREAMS);
});

test("single-language streams match their code", () => {
    expect(filterStreamsByLanguage(STREAMS, "de").map((s) => s.username)).toEqual(["a"]);
});

test("multi-language streams match either of their codes", () => {
    expect(filterStreamsByLanguage(STREAMS, "en").map((s) => s.username)).toEqual(["b", "d"]);
    expect(filterStreamsByLanguage(STREAMS, "fr").map((s) => s.username)).toEqual(["b"]);
});

test("unspecified streams never match a concrete filter", () => {
    expect(filterStreamsByLanguage(STREAMS, "zz")).toEqual([]);
    expect(filterStreamsByLanguage(STREAMS, "de").some((s) => s.username === "c")).toBe(false);
});
