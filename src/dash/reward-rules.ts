export const REWARD_TITLE_MIN = 2;
export const REWARD_TITLE_MAX = 48;
export const REWARD_COST_MIN = 1;
export const REWARD_COST_MAX = 1000000;
export const REWARD_LIMIT = 32;

export interface RewardTitleValidation {
    ok: boolean;
    value: string;
    error: string | null;
}

export interface RewardCostValidation {
    ok: boolean;
    value: number;
    error: string | null;
}

export function validateRewardTitle(raw: string): RewardTitleValidation {
    const trimmed = raw.trim();
    if (trimmed.length < REWARD_TITLE_MIN || trimmed.length > REWARD_TITLE_MAX) {
        return {
            ok: false,
            value: trimmed,
            error: `Title must be ${REWARD_TITLE_MIN} to ${REWARD_TITLE_MAX} characters.`,
        };
    }
    return { ok: true, value: trimmed, error: null };
}

export function validateRewardCost(raw: string): RewardCostValidation {
    const trimmed = raw.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(value) || value < REWARD_COST_MIN || value > REWARD_COST_MAX) {
        return {
            ok: false,
            value: 0,
            error: `Cost must be a whole number from ${REWARD_COST_MIN} to ${REWARD_COST_MAX.toLocaleString("en-US")}.`,
        };
    }
    return { ok: true, value, error: null };
}

export function clampRewardCost(value: number): number {
    if (!Number.isFinite(value)) return REWARD_COST_MIN;
    const whole = Math.floor(value);
    if (whole < REWARD_COST_MIN) return REWARD_COST_MIN;
    if (whole > REWARD_COST_MAX) return REWARD_COST_MAX;
    return whole;
}

export function rewardLimitReached(count: number): boolean {
    return count >= REWARD_LIMIT;
}
