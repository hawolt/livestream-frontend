import { describe, expect, test } from "bun:test";
import { parseStreamInfoFrame } from "../src/live/stream-info-wire.ts";

describe("parseStreamInfoFrame", () => {
    test("reads a full frame", () => {
        const result = parseStreamInfoFrame({
            type: "stream-info",
            title: "New title",
            category: "Just Chatting",
            categoryId: 5,
            language: "en",
        });
        expect(result).toEqual({ title: "New title", category: "Just Chatting", categoryId: 5, language: "en" });
    });

    test("defaults missing category, categoryId and language", () => {
        const result = parseStreamInfoFrame({ type: "stream-info", title: "" });
        expect(result).toEqual({ title: "", category: "", categoryId: null, language: "und" });
    });

    test("treats a null category and categoryId as unset", () => {
        const result = parseStreamInfoFrame({
            type: "stream-info",
            title: "t",
            category: null,
            categoryId: null,
            language: null,
        });
        expect(result).toEqual({ title: "t", category: "", categoryId: null, language: "und" });
    });

    test("rejects a frame of another type", () => {
        expect(parseStreamInfoFrame({ type: "viewcount", viewers: 3 })).toBeNull();
    });

    test("rejects non-object input", () => {
        expect(parseStreamInfoFrame(null)).toBeNull();
        expect(parseStreamInfoFrame("stream-info")).toBeNull();
        expect(parseStreamInfoFrame(undefined)).toBeNull();
    });

    test("ignores a non-numeric categoryId", () => {
        const result = parseStreamInfoFrame({ type: "stream-info", title: "t", categoryId: "5" });
        expect(result?.categoryId).toBeNull();
    });
});
