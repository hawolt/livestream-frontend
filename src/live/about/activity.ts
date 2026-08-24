export interface ActivityDay {
    day: string;
    seconds: number;
    secondsKnown: boolean;
}

const DAY_MS = 86400000;
const WEEK_MS = 604800000;
const HOUR_SECONDS = 3600;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const ACTIVITY_LEVELS = [1, 2, 3, 4];

export const ACTIVITY_LEVEL_LABELS: Record<number, string> = {
    1: "under 1h live",
    2: "1h to 3h live",
    3: "3h to 6h live",
    4: "6h or more live",
};

export function dayKeyFromTime(t: number): string {
    return new Date(t).toISOString().slice(0, 10);
}

export function dayTime(key: string): number {
    return new Date(`${key}T00:00:00Z`).getTime();
}

export function todayKey(nowMs: number = Date.now()): string {
    return dayKeyFromTime(nowMs);
}

export function shiftDayKey(key: string, days: number): string {
    return dayKeyFromTime(dayTime(key) + days * DAY_MS);
}

export function weekdayIndex(key: string): number {
    return (new Date(dayTime(key)).getUTCDay() + 6) % 7;
}

export function weekStart(key: string): string {
    return shiftDayKey(key, -weekdayIndex(key));
}

export function weekSpan(startKey: string, endKey: string): number {
    return Math.max(1, Math.floor((dayTime(endKey) - dayTime(startKey)) / WEEK_MS) + 1);
}

export function monthLabel(key: string): string {
    return MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? "";
}

export function normalizeActivityPayload(raw: unknown): ActivityDay[] {
    if (!raw || typeof raw !== "object") return [];
    const source = raw as { days?: unknown; activity?: unknown };
    const byDay = new Map<string, ActivityDay>();
    if (Array.isArray(source.days)) {
        for (const day of source.days) {
            if (typeof day === "string" && day) byDay.set(day, { day, seconds: 0, secondsKnown: false });
        }
    }
    if (Array.isArray(source.activity)) {
        for (const entry of source.activity) {
            if (!entry || typeof entry !== "object") continue;
            const item = entry as Record<string, unknown>;
            const day = typeof item["day"] === "string" ? item["day"] as string : "";
            if (!day) continue;
            const value = item["seconds"];
            const seconds = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
            const secondsKnown = item["secondsKnown"] === true && seconds > 0;
            byDay.set(day, { day, seconds: secondsKnown ? seconds : 0, secondsKnown });
        }
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export function activityLevel(seconds: number): number {
    if (seconds >= 6 * HOUR_SECONDS) return 4;
    if (seconds >= 3 * HOUR_SECONDS) return 3;
    if (seconds >= HOUR_SECONDS) return 2;
    return 1;
}

export function formatActivityDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / HOUR_SECONDS);
    const minutes = Math.floor((total % HOUR_SECONDS) / 60);
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    if (minutes) return `${minutes}m`;
    return "under a minute";
}

export function activityDayTitle(day: string, entry: ActivityDay | undefined): string {
    if (!entry) return `${day} - no stream`;
    if (!entry.secondsKnown) return `${day} - was live, duration unknown`;
    return `${day} - live ${formatActivityDuration(entry.seconds)}`;
}

export function activityNote(entries: ActivityDay[]): string {
    const total = entries.length;
    const known = entries.filter(entry => entry.secondsKnown);
    const unknown = total - known.length;
    const seconds = known.reduce((sum, entry) => sum + entry.seconds, 0);
    const parts = [total === 1 ? "1 day live" : `${total} days live`];
    if (seconds > 0) parts.push(`${formatActivityDuration(seconds)} streamed`);
    if (unknown > 0) parts.push(unknown === 1 ? "1 day without duration data" : `${unknown} days without duration data`);
    return parts.join(", ");
}
