import { expect, test } from "bun:test";
import { normalizeAchievements, achievementDisplayName, achievementTooltip } from "../src/live/about/achievements.ts";

test("normalizes a well formed achievement list", () => {
    const achievements = normalizeAchievements([
        { key: "followers", tier: 2, unlockedAt: "2026-08-10T00:00:00Z" },
    ]);
    expect(achievements).toEqual([
        { key: "followers", tier: 2, unlockedAt: "2026-08-10T00:00:00Z" },
    ]);
});

test("skips unknown keys so future backend additions never break the page", () => {
    const achievements = normalizeAchievements([
        { key: "followers", tier: 1, unlockedAt: "2026-08-10T00:00:00Z" },
        { key: "some_future_key", tier: 1, unlockedAt: "2026-08-11T00:00:00Z" },
    ]);
    expect(achievements).toEqual([
        { key: "followers", tier: 1, unlockedAt: "2026-08-10T00:00:00Z" },
    ]);
});

test("skips entries with a non integer or sub one tier", () => {
    const achievements = normalizeAchievements([
        { key: "followers", tier: 0, unlockedAt: "2026-08-10T00:00:00Z" },
        { key: "followers", tier: 1.5, unlockedAt: "2026-08-10T00:00:00Z" },
        { key: "followers", tier: "3", unlockedAt: "2026-08-10T00:00:00Z" },
    ]);
    expect(achievements).toEqual([]);
});

test("skips entries missing unlockedAt", () => {
    const achievements = normalizeAchievements([{ key: "followers", tier: 1 }]);
    expect(achievements).toEqual([]);
});

test("sorts newest unlock first regardless of input order", () => {
    const achievements = normalizeAchievements([
        { key: "followers", tier: 1, unlockedAt: "2026-01-01T00:00:00Z" },
        { key: "avatar_set", tier: 1, unlockedAt: "2026-08-10T00:00:00Z" },
        { key: "bio_set", tier: 1, unlockedAt: "2026-05-05T00:00:00Z" },
    ]);
    expect(achievements.map(a => a.key)).toEqual(["avatar_set", "bio_set", "followers"]);
});

test("is defensive about missing or malformed input", () => {
    expect(normalizeAchievements(undefined)).toEqual([]);
    expect(normalizeAchievements(null)).toEqual([]);
    expect(normalizeAchievements("achievements")).toEqual([]);
    expect(normalizeAchievements([null, 42, "x", { key: 5 }])).toEqual([]);
});

test("achievementDisplayName humanizes known keys, matching the medallion sheet", () => {
    expect(achievementDisplayName("followers")).toBe("Following");
    expect(achievementDisplayName("stream_streak")).toBe("On Fire");
    expect(achievementDisplayName("completionist_profile")).toBe("Profile Completionist");
    expect(achievementDisplayName("completionist_setup")).toBe("Setup Completionist");
});

test("achievementTooltip omits the numeral at tier one and shows it from tier two on", () => {
    expect(achievementTooltip("followers", 1)).toBe("Following");
    expect(achievementTooltip("followers", 2)).toBe("Following II");
    expect(achievementTooltip("followers", 3)).toBe("Following III");
});
