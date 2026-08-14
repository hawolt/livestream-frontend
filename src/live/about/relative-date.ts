const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 2_629_800_000;

export function relativeDate(iso: string, nowMs: number = Date.now()): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = Math.max(0, nowMs - t);
    if (diff < MINUTE_MS) return "just now";
    if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
    if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
    if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
    if (diff < MONTH_MS) return `${Math.floor(diff / WEEK_MS)}w ago`;
    return `${Math.floor(diff / MONTH_MS)}mo ago`;
}
