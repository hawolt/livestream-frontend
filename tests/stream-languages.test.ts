import { expect, test } from "bun:test";
import {
    STREAM_LANGUAGE_OPTIONS,
    streamLanguageCodes,
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

test("multi-language values render as a joined label", () => {
    expect(streamLanguageLabel("fr,en")).toBe("French / English");
    expect(streamLanguageLabel(" FR , EN ")).toBe("French / English");
    expect(streamLanguageLabel("und,en")).toBe("English");
    expect(streamLanguageLabel("fr,xx")).toBe("French");
    expect(streamLanguageLabel("fr,en,de")).toBe("French / English");
});

test("stream language codes split, dedupe and cap at two", () => {
    expect(streamLanguageCodes("fr,en")).toEqual(["fr", "en"]);
    expect(streamLanguageCodes("fr,FR")).toEqual(["fr"]);
    expect(streamLanguageCodes("fr,en,de")).toEqual(["fr", "en"]);
    expect(streamLanguageCodes("und")).toEqual([]);
    expect(streamLanguageCodes(null)).toEqual([]);
});
