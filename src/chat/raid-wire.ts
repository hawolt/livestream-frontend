export interface RaidStart {
    target: string;
    seconds: number;
    count: number;
}

const CHANNEL_NAME_RE = /^[a-z0-9_-]{3,32}$/;
export const MAX_RAID_SECONDS = 600;
const MAX_RAID_COUNT = 1_000_000;

export function parseRaidStart(
    targetParam: string | undefined,
    secondsParam: string | undefined,
    countParam?: string,
): RaidStart | null {
    const target = (targetParam ?? "").toLowerCase();
    if (!CHANNEL_NAME_RE.test(target)) return null;
    const seconds = Number(secondsParam);
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_RAID_SECONDS) return null;
    return { target, seconds, count: parseRaidCount(countParam) ?? 0 };
}

export function parseRaidCount(param: string | undefined): number | null {
    if (param === undefined) return null;
    const n = Number(param);
    if (!Number.isInteger(n) || n < 0 || n > MAX_RAID_COUNT) return null;
    return n;
}

export function parseRaidTarget(param: string | undefined): string | null {
    const target = (param ?? "").toLowerCase();
    return CHANNEL_NAME_RE.test(target) ? target : null;
}
