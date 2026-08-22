import { describe, expect, test } from "bun:test";
import { joinStreamInfoLanguages, STREAM_INFO_TITLE_MAX, validateStreamInfoForm } from "../src/live/stream-info-form.ts";

describe("validateStreamInfoForm", () => {
    test("trims the title and passes categoryId and language through", () => {
        const result = validateStreamInfoForm({ title: "  Ranked grind  ", categoryId: 5, language: "en" });
        expect(result).toEqual({ ok: true, payload: { title: "Ranked grind", categoryId: 5, language: "en" } });
    });

    test("allows an empty title", () => {
        const result = validateStreamInfoForm({ title: "   ", categoryId: null, language: "und" });
        expect(result).toEqual({ ok: true, payload: { title: "", categoryId: null, language: "und" } });
    });

    test("allows a title at the max length", () => {
        const title = "a".repeat(STREAM_INFO_TITLE_MAX);
        const result = validateStreamInfoForm({ title, categoryId: null, language: "und" });
        expect(result.ok).toBe(true);
    });

    test("rejects a title over the max length", () => {
        const title = "a".repeat(STREAM_INFO_TITLE_MAX + 1);
        const result = validateStreamInfoForm({ title, categoryId: null, language: "und" });
        expect(result).toEqual({ ok: false, error: `Title too long (max ${STREAM_INFO_TITLE_MAX} chars)` });
    });

    test("counts the trimmed length, not the raw length", () => {
        const title = `  ${"a".repeat(STREAM_INFO_TITLE_MAX)}  `;
        const result = validateStreamInfoForm({ title, categoryId: null, language: "und" });
        expect(result.ok).toBe(true);
    });

    test("round-trips two languages through validation in join order", () => {
        const language = joinStreamInfoLanguages("en", "de");
        const result = validateStreamInfoForm({ title: "t", categoryId: null, language });
        expect(result).toEqual({ ok: true, payload: { title: "t", categoryId: null, language: "en,de" } });
    });
});

describe("joinStreamInfoLanguages", () => {
    test("joins a primary and secondary language in order", () => {
        expect(joinStreamInfoLanguages("en", "de")).toBe("en,de");
    });

    test("keeps only the primary when the secondary is cleared to und", () => {
        expect(joinStreamInfoLanguages("en", "und")).toBe("en");
    });

    test("keeps only the secondary when the primary is und", () => {
        expect(joinStreamInfoLanguages("und", "de")).toBe("de");
    });

    test("falls back to und when both are unspecified", () => {
        expect(joinStreamInfoLanguages("und", "und")).toBe("und");
    });

    test("dedupes an identical primary and secondary down to one code", () => {
        expect(joinStreamInfoLanguages("en", "en")).toBe("en");
    });

    test("preserves primary-then-secondary ordering regardless of alphabetical order", () => {
        expect(joinStreamInfoLanguages("de", "en")).toBe("de,en");
        expect(joinStreamInfoLanguages("en", "de")).toBe("en,de");
    });
});
