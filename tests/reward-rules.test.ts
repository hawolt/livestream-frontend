import { describe, expect, test } from "bun:test";
import {
    clampRewardCost,
    REWARD_COST_MAX,
    REWARD_COST_MIN,
    REWARD_LIMIT,
    rewardLimitReached,
    validateRewardCost,
    validateRewardTitle,
} from "../src/dash/reward-rules.ts";

describe("validateRewardTitle", () => {
    test("accepts titles within 2 to 48 characters", () => {
        expect(validateRewardTitle("Hydrate")).toEqual({ ok: true, value: "Hydrate", error: null });
        expect(validateRewardTitle("ab").ok).toBe(true);
        expect(validateRewardTitle("a".repeat(48)).ok).toBe(true);
    });

    test("trims surrounding whitespace before validating", () => {
        expect(validateRewardTitle("  Hydrate  ")).toEqual({ ok: true, value: "Hydrate", error: null });
    });

    test("rejects too short and too long titles with an error message", () => {
        const short = validateRewardTitle("a");
        expect(short.ok).toBe(false);
        expect(short.error).not.toBeNull();
        expect(validateRewardTitle("").ok).toBe(false);
        expect(validateRewardTitle("   ").ok).toBe(false);
        expect(validateRewardTitle("a".repeat(49)).ok).toBe(false);
    });
});

describe("validateRewardCost", () => {
    test("accepts whole numbers from 1 to 1000000", () => {
        expect(validateRewardCost("1")).toEqual({ ok: true, value: 1, error: null });
        expect(validateRewardCost("500")).toEqual({ ok: true, value: 500, error: null });
        expect(validateRewardCost("1000000").ok).toBe(true);
    });

    test("rejects zero, negatives, fractions and out of range values", () => {
        expect(validateRewardCost("0").ok).toBe(false);
        expect(validateRewardCost("-5").ok).toBe(false);
        expect(validateRewardCost("1.5").ok).toBe(false);
        expect(validateRewardCost("1000001").ok).toBe(false);
    });

    test("rejects empty and non numeric input", () => {
        expect(validateRewardCost("").ok).toBe(false);
        expect(validateRewardCost("   ").ok).toBe(false);
        expect(validateRewardCost("abc").ok).toBe(false);
        const result = validateRewardCost("abc");
        expect(result.error).not.toBeNull();
    });
});

describe("clampRewardCost", () => {
    test("clamps into the allowed range and floors fractions", () => {
        expect(clampRewardCost(0)).toBe(REWARD_COST_MIN);
        expect(clampRewardCost(-10)).toBe(REWARD_COST_MIN);
        expect(clampRewardCost(2000000)).toBe(REWARD_COST_MAX);
        expect(clampRewardCost(12.9)).toBe(12);
        expect(clampRewardCost(500)).toBe(500);
    });

    test("maps non finite values to the minimum", () => {
        expect(clampRewardCost(Number.NaN)).toBe(REWARD_COST_MIN);
        expect(clampRewardCost(Number.POSITIVE_INFINITY)).toBe(REWARD_COST_MIN);
    });
});

describe("rewardLimitReached", () => {
    test("flags the 32 reward cap", () => {
        expect(rewardLimitReached(REWARD_LIMIT - 1)).toBe(false);
        expect(rewardLimitReached(REWARD_LIMIT)).toBe(true);
        expect(rewardLimitReached(REWARD_LIMIT + 1)).toBe(true);
    });
});
