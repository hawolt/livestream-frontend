export type ServiceStatus = "operational" | "degraded" | "down" | "unknown";

export interface OverviewService {
    id: string;
    label: string;
    region: string | null;
    status: ServiceStatus;
    latencyMs: number | null;
    uptime24h: number | null;
    uptime90d: number | null;
    lastChange: string | null;
}

export interface OverviewGroup {
    label: string;
    services: OverviewService[];
}

export interface Overview {
    generatedAt: string;
    overall: ServiceStatus;
    groups: OverviewGroup[];
}

export function normalizeStatus(value: unknown): ServiceStatus {
    return value === "operational" || value === "degraded" || value === "down" ? value : "unknown";
}

export function statusLabel(status: ServiceStatus): string {
    switch (status) {
        case "operational":
            return "Operational";
        case "degraded":
            return "Degraded";
        case "down":
            return "Down";
        default:
            return "Unknown";
    }
}

export function overallBanner(overall: ServiceStatus): { label: string; cls: ServiceStatus } {
    switch (overall) {
        case "operational":
            return { label: "All systems operational", cls: "operational" };
        case "degraded":
            return { label: "Some systems are degraded", cls: "degraded" };
        case "down":
            return { label: "Major outage", cls: "down" };
        default:
            return { label: "Status unknown", cls: "unknown" };
    }
}

export function formatUptime(value: number | null): string {
    if (value === null) return "no data";
    return `${Number(value.toFixed(2))}%`;
}

export function formatLatency(value: number | null): string {
    if (value === null) return "";
    return `${Math.round(value)} ms`;
}

export function relativeTime(iso: string | null, nowMs: number): string {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = nowMs - t;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function optionalNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function parseService(data: unknown): OverviewService | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.label !== "string") return null;
    return {
        id: raw.id,
        label: raw.label,
        region: optionalString(raw.region),
        status: normalizeStatus(raw.status),
        latencyMs: optionalNumber(raw.latencyMs),
        uptime24h: optionalNumber(raw.uptime24h),
        uptime90d: optionalNumber(raw.uptime90d),
        lastChange: optionalString(raw.lastChange),
    };
}

export function parseOverview(data: unknown): Overview | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as Record<string, unknown>;
    if (!Array.isArray(raw.groups)) return null;
    const groups: OverviewGroup[] = [];
    for (const entry of raw.groups) {
        if (typeof entry !== "object" || entry === null) continue;
        const rawGroup = entry as Record<string, unknown>;
        if (typeof rawGroup.label !== "string" || !Array.isArray(rawGroup.services)) continue;
        const services: OverviewService[] = [];
        for (const svc of rawGroup.services) {
            const parsed = parseService(svc);
            if (parsed) services.push(parsed);
        }
        groups.push({ label: rawGroup.label, services });
    }
    return {
        generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
        overall: normalizeStatus(raw.overall),
        groups,
    };
}
