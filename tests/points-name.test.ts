import { describe, expect, test } from "bun:test";
import { validatePointsName } from "../src/dash/points-name.ts";

describe("validatePointsName", () => {
    test("accepts an empty value as a clear", () => {
        expect(validatePointsName("")).toEqual({ ok: true, value: "", error: null });
        expect(validatePointsName("   ")).toEqual({ ok: true, value: "", error: null });
    });

    test("accepts letters, digits and spaces within length bounds", () => {
        expect(validatePointsName("Bits")).toEqual({ ok: true, value: "Bits", error: null });
        expect(validatePointsName("Gold Coins 42")).toEqual({ ok: true, value: "Gold Coins 42", error: null });
    });

    test("trims surrounding whitespace before validating", () => {
        expect(validatePointsName("  Gems  ")).toEqual({ ok: true, value: "Gems", error: null });
    });

    test("rejects a single character", () => {
        const result = validatePointsName("A");
        expect(result.ok).toBe(false);
        expect(result.error).not.toBeNull();
    });

    test("rejects more than 24 characters", () => {
        const result = validatePointsName("A".repeat(25));
        expect(result.ok).toBe(false);
    });

    test("rejects punctuation and symbols", () => {
        expect(validatePointsName("Gold!").ok).toBe(false);
        expect(validatePointsName("50%-off").ok).toBe(false);
        expect(validatePointsName("emoji🔥").ok).toBe(false);
    });

    test("accepts the boundary lengths", () => {
        expect(validatePointsName("ab").ok).toBe(true);
        expect(validatePointsName("a".repeat(24)).ok).toBe(true);
        expect(validatePointsName("a".repeat(25)).ok).toBe(false);
    });
});
