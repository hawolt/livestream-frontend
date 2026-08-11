export interface RaidStart {
    target: string;
    seconds: number;
}

export interface RaidIncoming {
    raider: string;
    viewers: number;
}

const CHANNEL_NAME_RE = /^[a-z0-9_-]{3,32}$/;
export const MAX_RAID_SECONDS = 600;

export function parseRaidStart(targetParam: string | undefined, secondsParam: string | undefined): RaidStart | null {
    const target = (targetParam ?? "").toLowerCase();
    if (!CHANNEL_NAME_RE.test(target)) return null;
    const seconds = Number(secondsParam);
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_RAID_SECONDS) return null;
    return { target, seconds };
}

export function parseRaidIncoming(raiderParam: string | undefined, viewersParam: string | undefined): RaidIncoming | null {
    const raider = (raiderParam ?? "").trim();
    if (!CHANNEL_NAME_RE.test(raider.toLowerCase())) return null;
    const viewers = Number(viewersParam);
    return { raider, viewers: Number.isFinite(viewers) && viewers > 0 ? Math.floor(viewers) : 0 };
}
