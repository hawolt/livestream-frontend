import { describe, expect, test } from "bun:test";
import { channelPageTitle, chatPopoutTitle, clipPageTitle } from "../src/live/page-title.ts";

describe("channelPageTitle", () => {
    test("brands a bare channel", () => {
        expect(channelPageTitle("hawolt")).toBe("hawolt | ITZON");
    });

    test("appends a short stream title", () => {
        expect(channelPageTitle("hawolt", "ranked grind")).toBe("hawolt - ranked grind | ITZON");
    });

    test("treats a blank stream title as absent", () => {
        expect(channelPageTitle("hawolt", "   ")).toBe("hawolt | ITZON");
        expect(channelPageTitle("hawolt", null)).toBe("hawolt | ITZON");
    });

    test("truncates a long stream title instead of dropping it", () => {
        const title = channelPageTitle("hawolt", "an extremely long stream title that nobody would ever read to the end of");
        expect(title.length).toBeLessThanOrEqual(65);
        expect(title.startsWith("hawolt - an extremely long")).toBe(true);
        expect(title.endsWith("... | ITZON")).toBe(true);
    });

    test("drops the stream title when the name leaves no usable room", () => {
        const name = "a".repeat(50);
        expect(channelPageTitle(name, "some stream title")).toBe(`${name} | ITZON`);
    });

    test("falls back to the brand with no name", () => {
        expect(channelPageTitle("   ")).toBe("ITZON");
    });
});

describe("clipPageTitle", () => {
    test("uses the clip title first", () => {
        expect(clipPageTitle("hawolt", "insane play")).toBe("insane play - clip by hawolt | ITZON");
    });

    test("falls back to the channel for an untitled clip", () => {
        expect(clipPageTitle("hawolt", "")).toBe("hawolt clip | ITZON");
        expect(clipPageTitle("hawolt", null)).toBe("hawolt clip | ITZON");
    });

    test("falls back to the brand with no channel", () => {
        expect(clipPageTitle("", null)).toBe("Clip | ITZON");
    });
});

describe("chatPopoutTitle", () => {
    test("names the channel", () => {
        expect(chatPopoutTitle("hawolt")).toBe("hawolt chat | ITZON");
    });

    test("falls back with no channel", () => {
        expect(chatPopoutTitle("")).toBe("Chat | ITZON");
    });
});
