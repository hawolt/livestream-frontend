import { expect, test } from "bun:test";
import {
    achievementBucket,
    achievementDisplay,
    clampFillRatio,
    compareAchievementEntries,
    formatMetric,
    medalEligibleUnlockedCount,
    medalRewardStatus,
    progressLabel,
    sortAchievementEntries,
    unwrapAchievementsPayload,
    type AchievementEntry,
} from "../src/dash/achievements-view.ts";

test("unwrapAchievementsPayload unwraps the achievements envelope", () => {
    const inner = [{ key: "followers", tier: 1, current: 5, next: 10 }];
    expect(unwrapAchievementsPayload({ achievements: inner })).toEqual(inner);
});

test("unwrapAchievementsPayload passes a bare array through", () => {
    const inner = [{ key: "followers", tier: 1, current: 5, next: 10 }];
    expect(unwrapAchievementsPayload(inner)).toEqual(inner);
});

test("unwrapAchievementsPayload answers empty for junk", () => {
    expect(unwrapAchievementsPayload(null)).toEqual([]);
    expect(unwrapAchievementsPayload("x")).toEqual([]);
    expect(unwrapAchievementsPayload({ achievements: "x" })).toEqual([]);
    expect(unwrapAchievementsPayload({})).toEqual([]);
});

function entry(key: string, tier: number, current: number, next: number | null): AchievementEntry {
    return { key: key as AchievementEntry["key"], tier, current, next };
}

test("clampFillRatio clamps into 0..1", () => {
    expect(clampFillRatio(0, 100)).toBe(0);
    expect(clampFillRatio(50, 100)).toBe(0.5);
    expect(clampFillRatio(100, 100)).toBe(1);
    expect(clampFillRatio(150, 100)).toBe(1);
    expect(clampFillRatio(-10, 100)).toBe(0);
});

test("clampFillRatio treats a null or non positive next as fully filled", () => {
    expect(clampFillRatio(5, null)).toBe(1);
    expect(clampFillRatio(0, 0)).toBe(1);
    expect(clampFillRatio(0, -5)).toBe(1);
});

test("formatMetric adds thousands separators", () => {
    expect(formatMetric(0)).toBe("0");
    expect(formatMetric(1204)).toBe("1,204");
    expect(formatMetric(5000)).toBe("5,000");
    expect(formatMetric(1234567)).toBe("1,234,567");
});

test("formatMetric rounds and floors negatives to zero", () => {
    expect(formatMetric(4.6)).toBe("5");
    expect(formatMetric(-3)).toBe("0");
});

test("progressLabel pairs formatted current and next", () => {
    expect(progressLabel(1204, 5000)).toBe("1,204 / 5,000");
});

test("progressLabel reports Max when next is null", () => {
    expect(progressLabel(9999, null)).toBe("Max");
});

test("achievementDisplay shows a bar while locked with real progress", () => {
    const display = achievementDisplay(entry("followers", 0, 40, 100));
    expect(display).toEqual({ kind: "bar", ratio: 0.4, label: "40 / 100" });
});

test("achievementDisplay treats a locked one shot (next of 1) as pending, not an empty bar", () => {
    expect(achievementDisplay(entry("first_stream", 0, 0, 1))).toEqual({ kind: "pending" });
});

test("achievementDisplay shows a bar while unlocked with more tiers to go", () => {
    const display = achievementDisplay(entry("followers", 1, 120, 500));
    expect(display).toEqual({ kind: "bar", ratio: 0.24, label: "120 / 500" });
});

test("achievementDisplay reports maxed for a ladder past its final tier", () => {
    expect(achievementDisplay(entry("followers", 6, 100000, null))).toEqual({ kind: "maxed" });
});

test("achievementDisplay reports done for an unlocked one shot", () => {
    expect(achievementDisplay(entry("first_stream", 1, 1, null))).toEqual({ kind: "done" });
});

test("achievementBucket classifies unlocked, in progress and untouched", () => {
    expect(achievementBucket(entry("followers", 1, 10, null))).toBe("unlocked");
    expect(achievementBucket(entry("followers", 0, 5, 100))).toBe("in-progress");
    expect(achievementBucket(entry("followers", 0, 0, 100))).toBe("untouched");
});

test("compareAchievementEntries ranks unlocked above in progress above untouched", () => {
    const unlocked = entry("followers", 1, 10, null);
    const inProgress = entry("audience", 0, 5, 100);
    const untouched = entry("airtime", 0, 0, 100);
    const sorted = sortAchievementEntries([untouched, unlocked, inProgress]);
    expect(sorted.map(e => e.key)).toEqual(["followers", "audience", "airtime"]);
});

test("compareAchievementEntries sorts unlocked entries by highest tier first", () => {
    const low = entry("followers", 1, 10, 100);
    const high = entry("audience", 4, 10, 100);
    expect(sortAchievementEntries([low, high]).map(e => e.key)).toEqual(["audience", "followers"]);
});

test("compareAchievementEntries sorts in progress entries by fill ratio descending", () => {
    const near = entry("followers", 0, 90, 100);
    const far = entry("audience", 0, 10, 100);
    expect(sortAchievementEntries([far, near]).map(e => e.key)).toEqual(["followers", "audience"]);
});

test("compareAchievementEntries leaves untouched entries in stable order", () => {
    const a = entry("followers", 0, 0, 100);
    const b = entry("audience", 0, 0, 100);
    expect(sortAchievementEntries([a, b]).map(e => e.key)).toEqual(["followers", "audience"]);
});

test("compareAchievementEntries is defensive against unusual data", () => {
    const a = entry("followers", 0, 0, 100);
    const b = entry("audience", 0, 0, 100);
    expect(compareAchievementEntries(a, b)).toBe(0);
});

test("medalRewardStatus counts down to ten unlocked", () => {
    expect(medalRewardStatus(0)).toEqual({
        earned: false,
        remaining: 10,
        message: "Unlock 10 more achievements to earn the Medal chat badge.",
    });
});

test("medalRewardStatus reports one remaining just under the threshold", () => {
    expect(medalRewardStatus(9)).toEqual({
        earned: false,
        remaining: 1,
        message: "Unlock 1 more achievement to earn the Medal chat badge.",
    });
});

test("medalRewardStatus reports earned exactly at the threshold", () => {
    expect(medalRewardStatus(10)).toEqual({
        earned: true,
        remaining: 0,
        message: "Medal chat badge earned.",
    });
});

test("medalEligibleUnlockedCount excludes the collector key itself", () => {
    const entries = [
        entry("collector", 1, 5, 10),
        entry("followers", 1, 100, null),
        entry("audience", 1, 100, null),
        entry("airtime", 0, 0, 100),
    ];
    expect(medalEligibleUnlockedCount(entries)).toBe(2);
});

test("medalEligibleUnlockedCount ignores a locked collector row", () => {
    const entries = [
        entry("collector", 0, 3, 5),
        entry("followers", 1, 100, null),
    ];
    expect(medalEligibleUnlockedCount(entries)).toBe(1);
});

test("medalRewardStatus stays earned above the threshold", () => {
    expect(medalRewardStatus(15)).toEqual({
        earned: true,
        remaining: 0,
        message: "Medal chat badge earned.",
    });
});
