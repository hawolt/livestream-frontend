import { expect, test } from "bun:test";
import { normalizeClipsPayload } from "../src/live/about/clips.ts";

test("normalizes a well formed clips payload", () => {
    const clips = normalizeClipsPayload({
        clips: [{ id: "abc", title: "Nice play", createdAt: "2026-08-01T00:00:00Z", url: "https://x.com/c/abc", poster: "https://x.com/p.png", views: 42 }],
    });
    expect(clips).toEqual([
        { id: "abc", title: "Nice play", createdAt: "2026-08-01T00:00:00Z", url: "https://x.com/c/abc", poster: "https://x.com/p.png", views: 42 },
    ]);
});

test("skips entries with no id", () => {
    const clips = normalizeClipsPayload({ clips: [{ title: "No id" }] });
    expect(clips).toEqual([]);
});

test("fills missing string fields with empty strings and missing views with zero", () => {
    const clips = normalizeClipsPayload({ clips: [{ id: "abc" }] });
    expect(clips).toEqual([{ id: "abc", title: "", createdAt: "", url: "", poster: "", views: 0 }]);
});

test("is defensive about missing or malformed input", () => {
    expect(normalizeClipsPayload(undefined)).toEqual([]);
    expect(normalizeClipsPayload(null)).toEqual([]);
    expect(normalizeClipsPayload({})).toEqual([]);
    expect(normalizeClipsPayload({ clips: "nope" })).toEqual([]);
    expect(normalizeClipsPayload({ clips: [null, 42, "x"] })).toEqual([]);
});
