export interface HistoryBucket {
    day: string;
    ok: number;
    total: number;
    uptime: number | null;
    downMinutes: number;
}

export interface HistoryCheck {
    id: string;
    label: string;
    group: string;
    region: string | null;
    days: HistoryBucket[];
}

export interface HistoryIncident {
    id: number;
    checkId: string;
    label: string;
    startedAt: string;
    endedAt: string | null;
    resolved: boolean;
    durationMinutes: number;
    note: string | null;
}

export interface History {
    generatedAt: string;
    days: number;
    firstSampleAt: string | null;
    checks: HistoryCheck[];
    incidents: HistoryIncident[];
}

export type BarLevel = "none" | "up" | "warn" | "down";

export interface DayBar {
    day: string;
    level: BarLevel;
    uptime: number | null;
    title: string;
}

export const MAX_NOTE_CHARS = 280;

const UP_THRESHOLD = 99.5;
const WARN_THRESHOLD = 97;
const DAY_MS = 86_400_000;

function optionalNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function barLevel(uptime: number | null): BarLevel {
    if (uptime === null) return "none";
    if (uptime >= UP_THRESHOLD) return "up";
    if (uptime >= WARN_THRESHOLD) return "warn";
    return "down";
}

export function formatDuration(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes < 1) return "under a minute";
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = Math.floor(minutes % 60);
    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    return `${mins}m`;
}

export function noteText(note: string | null): string {
    if (typeof note !== "string") return "";
    const trimmed = note.trim();
    return trimmed.length > MAX_NOTE_CHARS ? trimmed.slice(0, MAX_NOTE_CHARS) : trimmed;
}

export function utcDayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function dayKeys(days: number, nowMs: number): string[] {
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) keys.push(utcDayKey(nowMs - i * DAY_MS));
    return keys;
}

export function bucketTitle(day: string, bucket: HistoryBucket | undefined): string {
    if (!bucket || bucket.uptime === null) return `${day}: no data`;
    const uptime = `${Number(bucket.uptime.toFixed(2))}% uptime`;
    if (bucket.downMinutes <= 0) return `${day}: ${uptime}`;
    return `${day}: ${uptime}, ${bucket.downMinutes} min down`;
}

export function buildStrip(buckets: HistoryBucket[], days: number, nowMs: number): DayBar[] {
    const byDay = new Map<string, HistoryBucket>();
    for (const bucket of buckets) byDay.set(bucket.day, bucket);
    return dayKeys(days, nowMs).map((day) => {
        const bucket = byDay.get(day);
        const uptime = bucket ? bucket.uptime : null;
        return { day, level: barLevel(uptime), uptime, title: bucketTitle(day, bucket) };
    });
}

export function historySummary(firstSampleAt: string | null, days: number, nowMs: number): string {
    if (!firstSampleAt) return "No uptime history recorded yet";
    const started = Date.parse(firstSampleAt);
    if (!Number.isFinite(started)) return "No uptime history recorded yet";
    const covered = Math.max(0, Math.floor((nowMs - started) / DAY_MS));
    if (covered < 1) return `Uptime history since today, showing ${days} days`;
    if (covered < days) return `Uptime history covers ${covered} of the last ${days} days`;
    return `Uptime history for the last ${days} days`;
}

function parseBucket(data: unknown): HistoryBucket | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (typeof raw.day !== "string") return null;
    return {
        day: raw.day,
        ok: numberOr(raw.ok, 0),
        total: numberOr(raw.total, 0),
        uptime: optionalNumber(raw.uptime),
        downMinutes: numberOr(raw.downMinutes, 0),
    };
}

function parseCheck(data: unknown): HistoryCheck | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.label !== "string") return null;
    const days: HistoryBucket[] = [];
    if (Array.isArray(raw.days)) {
        for (const entry of raw.days) {
            const bucket = parseBucket(entry);
            if (bucket) days.push(bucket);
        }
    }
    return {
        id: raw.id,
        label: raw.label,
        group: typeof raw.group === "string" ? raw.group : "",
        region: optionalString(raw.region),
        days,
    };
}

function parseIncident(data: unknown): HistoryIncident | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (typeof raw.id !== "number" || typeof raw.startedAt !== "string") return null;
    return {
        id: raw.id,
        checkId: typeof raw.checkId === "string" ? raw.checkId : "",
        label: typeof raw.label === "string" ? raw.label : "",
        startedAt: raw.startedAt,
        endedAt: optionalString(raw.endedAt),
        resolved: raw.resolved === true,
        durationMinutes: numberOr(raw.durationMinutes, 0),
        note: optionalString(raw.note),
    };
}

export function parseHistory(data: unknown): History | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (!Array.isArray(raw.checks)) return null;
    const checks: HistoryCheck[] = [];
    for (const entry of raw.checks) {
        const check = parseCheck(entry);
        if (check) checks.push(check);
    }
    const incidents: HistoryIncident[] = [];
    if (Array.isArray(raw.incidents)) {
        for (const entry of raw.incidents) {
            const incident = parseIncident(entry);
            if (incident) incidents.push(incident);
        }
    }
    return {
        generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
        days: numberOr(raw.days, 90),
        firstSampleAt: optionalString(raw.firstSampleAt),
        checks,
        incidents,
    };
}
