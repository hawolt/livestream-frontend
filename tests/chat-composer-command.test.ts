import { describe, expect, test } from "bun:test";
import { normalizedCommandWord } from "../src/chat/text.ts";

describe("normalizedCommandWord", () => {
    test("dot prefix passes through", () => {
        expect(normalizedCommandWord(".w bob hi")).toBe(".w");
        expect(normalizedCommandWord(".BAN bob")).toBe(".ban");
    });
    test("slash prefix normalizes to dot", () => {
        expect(normalizedCommandWord("/w bob hi")).toBe(".w");
        expect(normalizedCommandWord("/whisper bob hi")).toBe(".whisper");
    });
    test("plain text is not a command", () => {
        expect(normalizedCommandWord("hello /w")).toBe("");
        expect(normalizedCommandWord("")).toBe("");
    });
    test("no double strip", () => {
        expect(normalizedCommandWord("/.ban x")).toBe("..ban");
        expect(normalizedCommandWord("//x")).toBe("./x");
    });
});
