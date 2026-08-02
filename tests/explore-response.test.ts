import { describe, expect, test } from "bun:test";
import { parseExploreData } from "../src/explore/response.ts";

describe("parseExploreData", () => {
    test("rejects successful payloads without the required collections", () => {
        expect(() => parseExploreData(null)).toThrow();
        expect(() => parseExploreData({ streams: [] })).toThrow();
        expect(() => parseExploreData({ categories: [] })).toThrow();
        expect(() => parseExploreData({ streams: [{}], categories: [] })).toThrow();
        expect(() => parseExploreData({ streams: [], categories: [{}] })).toThrow();
    });

    test("normalizes valid entries and drops unusable ones", () => {
        expect(parseExploreData({
            streams: [
                { username: " Alice ", title: 7, category: "Games", categoryId: 2, language: null, viewers: 4.8 },
                { username: "", viewers: 10 },
            ],
            categories: [
                { id: 2, name: " Games ", liveStreamCount: 1.9, viewerCount: -4 },
                { id: "bad", name: "Other" },
            ],
            mediaBase: "https://media.example",
        })).toEqual({
            streams: [{
                username: "Alice",
                title: "",
                category: "Games",
                categoryId: 2,
                language: "und",
                viewers: 4,
                mediaBase: undefined,
            }],
            categories: [{ id: 2, name: "Games", liveStreamCount: 1, viewerCount: 0, imageUrl: null }],
            mediaBase: "https://media.example",
        });
    });

    test("preserves a category's imageUrl when present", () => {
        expect(parseExploreData({
            streams: [],
            categories: [{ id: 3, name: "Art", imageUrl: "https://media.example/art.png" }],
        })).toEqual({
            streams: [],
            categories: [{ id: 3, name: "Art", liveStreamCount: 0, viewerCount: 0, imageUrl: "https://media.example/art.png" }],
            mediaBase: undefined,
        });
    });

    test("defaults imageUrl to null when absent or not a string", () => {
        expect(parseExploreData({
            streams: [],
            categories: [{ id: 4, name: "Music", imageUrl: 123 }],
        })).toEqual({
            streams: [],
            categories: [{ id: 4, name: "Music", liveStreamCount: 0, viewerCount: 0, imageUrl: null }],
            mediaBase: undefined,
        });
    });
});
