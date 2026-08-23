import { describe, expect, test } from "bun:test";
import { minorToAmountText } from "../src/patron/view.ts";

describe("minorToAmountText", () => {
    test("formats whole euros from minor units", () => {
        expect(minorToAmountText(500, "EUR")).toBe("5.00 €");
    });

    test("formats fractional amounts from minor units", () => {
        expect(minorToAmountText(1234, "EUR")).toBe("12.34 €");
    });

    test("never goes negative", () => {
        expect(minorToAmountText(-100, "EUR")).toBe("0.00 €");
    });

    test("falls back to the raw currency code when no symbol is known", () => {
        expect(minorToAmountText(500, "SEK")).toBe("5.00 SEK");
    });
});
