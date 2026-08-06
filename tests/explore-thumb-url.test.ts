import { describe, expect, test } from "bun:test";
import { buildThumbUrl } from "../src/explore/thumb-url.ts";

describe("buildThumbUrl", () => {
    test("uses the per-stream mediaBase when present", () => {
        expect(buildThumbUrl("Alice", "https://cdn.example/", "https://fallback.example", 123))
            .toBe("https://cdn.example/thumb/alice.jpg?t=123");
    });

    test("falls back to the explore mediaBase when the stream has none", () => {
        expect(buildThumbUrl("Bob", undefined, "https://fallback.example/", 456))
            .toBe("https://fallback.example/thumb/bob.jpg?t=456");
    });

    test("strips trailing slashes from either base", () => {
        expect(buildThumbUrl("carol", "https://cdn.example///", "", 1))
            .toBe("https://cdn.example/thumb/carol.jpg?t=1");
    });

    test("lowercases and URL-encodes the username", () => {
        expect(buildThumbUrl("Weird Name!", undefined, "https://fallback.example", 1))
            .toBe("https://fallback.example/thumb/weird%20name!.jpg?t=1");
    });

    test("prefers a custom thumbnail over the media thumb", () => {
        expect(buildThumbUrl("alice", "https://cdn.example", "https://fallback.example", 123, "/api/live/thumbnail/alice?v=42"))
            .toBe("/api/live/thumbnail/alice?v=42");
    });

    test("ignores an empty custom thumbnail", () => {
        expect(buildThumbUrl("alice", undefined, "https://fallback.example", 1, ""))
            .toBe("https://fallback.example/thumb/alice.jpg?t=1");
    });
});
