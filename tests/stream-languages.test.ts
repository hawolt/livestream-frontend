import { expect, test } from "bun:test";
import {
    STREAM_LANGUAGE_OPTIONS,
    streamLanguageLabel,
} from "../src/stream-languages.ts";

test("stream language codes and labels stay normalized and unique", () => {
    const codes = STREAM_LANGUAGE_OPTIONS.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe("und");
    expect(codes.length).toBeGreaterThan(180);
    expect(codes.slice(1).every((code) => /^[a-z]{2}$/.test(code))).toBe(true);
    expect(STREAM_LANGUAGE_OPTIONS.every((language) => language.label.length > 0)).toBe(true);
});

test("stream language labels resolve without inventing unknown values", () => {
    expect(streamLanguageLabel(" EN ")).toBe("English");
    expect(streamLanguageLabel("und")).toBeNull();
    expect(streamLanguageLabel("xx")).toBeNull();
    expect(streamLanguageLabel(42)).toBeNull();
});
