export interface HistoryBucket {
    start: string;
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
    buckets: HistoryBucket[];
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
    windowMinutes: number;
    bucketMinutes: number;
    firstSampleAt: string | null;
    checks: HistoryCheck[];
    incidents: HistoryIncident[];
}

export interface HistoryWindow {
    id: string;
    label: string;
    minutes: number;
}

export const HISTORY_WINDOWS: HistoryWindow[] = [
    { id: "24h", label: "24 hours", minutes: 24 * 60 },
    { id: "7d", label: "7 days", minutes: 7 * 24 * 60 },
    { id: "90d", label: "90 days", minutes: 90 * 24 * 60 },
];

export const HISTORY_BARS = 90;

export type BarLevel = "none" | "up" | "warn" | "down";

export interface DayBar {
    startMs: number;
    level: BarLevel;
    uptime: number | null;
    title: string;
}

export const MAX_NOTE_CHARS = 280;

const UP_THRESHOLD = 99.5;
const WARN_THRESHOLD = 97;

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

export function bucketStarts(bucketMinutes: number, bars: number, nowMs: number): number[] {
    const size = Math.max(1, bucketMinutes) * 60_000;
    const current = Math.floor(nowMs / size) * size;
    const starts: number[] = [];
    for (let i = bars - 1; i >= 0; i--) starts.push(current - i * size);
    return starts;
}

export function bucketLabel(startMs: number, bucketMinutes: number): string {
    const date = new Date(startMs);
    if (bucketMinutes >= 1440) return date.toISOString().slice(0, 10);
    const day = date.toISOString().slice(5, 10);
    const time = date.toISOString().slice(11, 16);
    return `${day} ${time} UTC`;
}

export function bucketTitle(startMs: number, bucketMinutes: number, bucket: HistoryBucket | undefined): string {
    const label = bucketLabel(startMs, bucketMinutes);
    if (!bucket || bucket.uptime === null) return `${label}: no data`;
    const uptime = `${Number(bucket.uptime.toFixed(2))}% uptime`;
    if (bucket.downMinutes <= 0) return `${label}: ${uptime}`;
    return `${label}: ${uptime}, ${bucket.downMinutes} min down`;
}

export function buildStrip(buckets: HistoryBucket[], bucketMinutes: number, nowMs: number,
                           bars: number = HISTORY_BARS): DayBar[] {
    const size = Math.max(1, bucketMinutes) * 60_000;
    const byStart = new Map<number, HistoryBucket>();
    for (const bucket of buckets) {
        const parsed = Date.parse(bucket.start);
        if (!Number.isFinite(parsed)) continue;
        byStart.set(Math.floor(parsed / size) * size, bucket);
    }
    return bucketStarts(bucketMinutes, bars, nowMs).map((startMs) => {
        const bucket = byStart.get(startMs);
        const uptime = bucket ? bucket.uptime : null;
        return { startMs, level: barLevel(uptime), uptime, title: bucketTitle(startMs, bucketMinutes, bucket) };
    });
}

export function newestBucketStart(history: History): number {
    let newest = 0;
    for (const check of history.checks) {
        for (const bucket of check.buckets) {
            const parsed = Date.parse(bucket.start);
            if (Number.isFinite(parsed) && parsed > newest) newest = parsed;
        }
    }
    return newest;
}

export function historyLagsCurrentBucket(history: History | null, nowMs: number): boolean {
    if (!history) return true;
    const size = Math.max(1, history.bucketMinutes) * 60_000;
    const current = Math.floor(nowMs / size) * size;
    return newestBucketStart(history) < current;
}

export function windowLabel(windowMinutes: number): string {
    const found = HISTORY_WINDOWS.find((entry) => entry.minutes === windowMinutes);
    if (found) return found.label;
    if (windowMinutes >= 1440) return `${Math.round(windowMinutes / 1440)} days`;
    return `${Math.round(windowMinutes / 60)} hours`;
}

export function historySummary(firstSampleAt: string | null, windowMinutes: number, bucketMinutes: number,
                               nowMs: number): string {
    const span = windowLabel(windowMinutes);
    const each = bucketMinutes >= 1440
        ? `${Math.round(bucketMinutes / 1440)} day`
        : `${bucketMinutes} minute`;
    if (!firstSampleAt) return "No uptime history recorded yet";
    const started = Date.parse(firstSampleAt);
    if (!Number.isFinite(started)) return "No uptime history recorded yet";
    const coveredMinutes = Math.max(0, Math.floor((nowMs - started) / 60_000));
    if (coveredMinutes < windowMinutes) {
        return `Uptime history covers ${windowLabel(coveredMinutes)} of the last ${span}, one bar per ${each}`;
    }
    return `Uptime history for the last ${span}, one bar per ${each}`;
}

function parseBucket(data: unknown): HistoryBucket | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (typeof raw.start !== "string") return null;
    return {
        start: raw.start,
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
    const buckets: HistoryBucket[] = [];
    if (Array.isArray(raw.buckets)) {
        for (const entry of raw.buckets) {
            const bucket = parseBucket(entry);
            if (bucket) buckets.push(bucket);
        }
    }
    return {
        id: raw.id,
        label: raw.label,
        group: typeof raw.group === "string" ? raw.group : "",
        region: optionalString(raw.region),
        buckets,
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
        windowMinutes: numberOr(raw.windowMinutes, 90 * 24 * 60),
        bucketMinutes: numberOr(raw.bucketMinutes, 1440),
        firstSampleAt: optionalString(raw.firstSampleAt),
        checks,
        incidents,
    };
}
