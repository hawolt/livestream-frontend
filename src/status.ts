import {
    formatLatency,
    formatUptime,
    overallBanner,
    parseOverview,
    relativeTime,
    statusLabel,
    type Overview,
    type OverviewService,
} from "./status/overview.ts";
import {
    buildStrip,
    formatDuration,
    historyLagsCurrentBucket,
    historySummary,
    noteText,
    parseHistory,
    HISTORY_WINDOWS,
    type History,
    type HistoryIncident,
} from "./status/history.ts";

const REFRESH_MS = 30000;
const HISTORY_REFRESH_MS = 300000;
const HISTORY_CATCHUP_MS = 60000;
const WINDOW_STORAGE_KEY = "status_window";
const DEFAULT_WINDOW_MINUTES = 24 * 60;
const INCIDENT_LIMIT = 20;

const bannerEl = document.getElementById("status-banner") as HTMLElement;
const updatedEl = document.getElementById("status-updated") as HTMLElement;
const groupsEl = document.getElementById("status-groups") as HTMLElement;
const incidentsEl = document.getElementById("status-incidents") as HTMLElement;

let lastLoadedAt = 0;
let lastHistoryAt = 0;
let hasData = false;
let loading = false;
let loadingHistory = false;
let overview: Overview | null = null;
let history: History | null = null;
let windowMinutes = storedWindowMinutes();

function storedWindowMinutes(): number {
    try {
        const raw = localStorage.getItem(WINDOW_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        if (HISTORY_WINDOWS.some((entry) => entry.minutes === parsed)) return parsed;
    } catch {
    }
    return DEFAULT_WINDOW_MINUTES;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function metaEntry(key: string, value: string): HTMLElement {
    const entry = el("span", "svc-meta-entry");
    if (value === "") return entry;
    entry.appendChild(el("span", "svc-meta-key", key));
    entry.appendChild(el("span", "svc-meta-value", value));
    return entry;
}

function historyStrip(serviceId: string, nowMs: number): HTMLElement | null {
    if (!history) return null;
    const check = history.checks.find((entry) => entry.id === serviceId);
    if (!check) return null;
    const strip = el("div", "svc-bars");
    for (const bar of buildStrip(check.buckets, history.bucketMinutes, nowMs)) {
        const node = el("span", `svc-bar ${bar.level}`);
        node.title = bar.title;
        strip.appendChild(node);
    }
    return strip;
}

function serviceRow(service: OverviewService, nowMs: number): HTMLElement {
    const row = el("div", "svc-row");
    const head = el("div", "svc-head");
    const name = el("div", "svc-name");
    name.appendChild(el("span", "svc-label", service.label));
    if (service.region) name.appendChild(el("span", "svc-region", service.region));
    head.appendChild(name);
    const meta = el("div", "svc-meta");
    meta.appendChild(metaEntry("latency", formatLatency(service.latencyMs)));
    meta.appendChild(metaEntry("24h", formatUptime(service.uptime24h)));
    meta.appendChild(metaEntry("90d", formatUptime(service.uptime90d)));
    meta.appendChild(metaEntry("since", relativeTime(service.lastChange, nowMs)));
    head.appendChild(meta);
    head.appendChild(el("span", `svc-chip ${service.status}`, statusLabel(service.status)));
    row.appendChild(head);
    const strip = historyStrip(service.id, nowMs);
    if (strip) row.appendChild(strip);
    return row;
}

function incidentRow(incident: HistoryIncident): HTMLElement {
    const row = el("article", "incident-row");
    const head = el("div", "incident-head");
    head.appendChild(el("span", "incident-label", incident.label || incident.checkId));
    head.appendChild(el("span", `incident-chip ${incident.resolved ? "resolved" : "ongoing"}`,
        incident.resolved ? "Resolved" : "Ongoing"));
    row.appendChild(head);
    const meta = el("div", "incident-meta");
    meta.appendChild(el("span", "incident-start", new Date(incident.startedAt).toLocaleString()));
    meta.appendChild(el("span", "incident-duration", formatDuration(incident.durationMinutes)));
    row.appendChild(meta);
    const note = noteText(incident.note);
    if (note) row.appendChild(el("p", "incident-note", note));
    return row;
}

function renderIncidents(): void {
    incidentsEl.textContent = "";
    if (!history) return;
    const card = el("section", "status-card");
    card.appendChild(el("h2", "status-card-title", "Recent incidents"));
    const incidents = history.incidents.slice(0, INCIDENT_LIMIT);
    if (incidents.length === 0) {
        card.appendChild(el("p", "status-empty", "No incidents recorded."));
    } else {
        for (const incident of incidents) card.appendChild(incidentRow(incident));
    }
    incidentsEl.appendChild(card);
}

function render(): void {
    if (!overview) return;
    const banner = overallBanner(overview.overall);
    bannerEl.className = `status-banner ${banner.cls}`;
    bannerEl.textContent = banner.label;
    groupsEl.textContent = "";
    const nowMs = Date.now();
    groupsEl.appendChild(windowSelector());
    for (const group of overview.groups) {
        const card = el("section", "status-card");
        card.appendChild(el("h2", "status-card-title", group.label));
        for (const service of group.services) {
            card.appendChild(serviceRow(service, nowMs));
        }
        groupsEl.appendChild(card);
    }
    if (history) {
        groupsEl.appendChild(el("p", "status-history-note",
            historySummary(history.firstSampleAt, history.windowMinutes, history.bucketMinutes, nowMs)));
    }
    renderIncidents();
}

function windowSelector(): HTMLElement {
    const bar = el("div", "status-window");
    bar.appendChild(el("span", "status-window-label", "History"));
    for (const entry of HISTORY_WINDOWS) {
        const active = entry.minutes === windowMinutes;
        const button = el("button", `status-window-option${active ? " active" : ""}`, entry.label);
        button.setAttribute("type", "button");
        if (active) button.setAttribute("aria-current", "true");
        button.addEventListener("click", () => {
            if (entry.minutes === windowMinutes) return;
            windowMinutes = entry.minutes;
            try {
                localStorage.setItem(WINDOW_STORAGE_KEY, String(entry.minutes));
            } catch {
            }
            history = null;
            lastHistoryAt = 0;
            render();
            void refreshHistory();
        });
        bar.appendChild(button);
    }
    return bar;
}

function renderError(): void {
    bannerEl.className = "status-banner unknown";
    bannerEl.textContent = "Status unavailable";
    updatedEl.textContent = "Could not load status, retrying";
    if (!hasData) {
        groupsEl.textContent = "";
        groupsEl.appendChild(el("p", "status-error", "The status service could not be reached."));
    }
}

async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
        const res = await fetch("/api/status/overview", { cache: "no-store" });
        if (!res.ok) {
            renderError();
            return;
        }
        const parsed = parseOverview(await res.json());
        if (!parsed) {
            renderError();
            return;
        }
        overview = parsed;
        render();
        hasData = true;
        lastLoadedAt = Date.now();
        updatedEl.textContent = `Last updated ${new Date(lastLoadedAt).toLocaleTimeString()}`;
    } catch {
        renderError();
    } finally {
        loading = false;
    }
}

async function refreshHistory(): Promise<void> {
    if (loadingHistory) return;
    loadingHistory = true;
    try {
        const res = await fetch(`/api/status/history?window=${windowMinutes}`, { cache: "no-store" });
        if (!res.ok) return;
        const parsed = parseHistory(await res.json());
        if (!parsed) return;
        history = parsed;
        lastHistoryAt = Date.now();
        render();
    } catch {
        return;
    } finally {
        loadingHistory = false;
    }
}

window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    void refresh();
    if (historyLagsCurrentBucket(history, Date.now())
        && Date.now() - lastHistoryAt >= HISTORY_CATCHUP_MS) {
        void refreshHistory();
    }
}, REFRESH_MS);

window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    void refreshHistory();
}, HISTORY_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastLoadedAt >= REFRESH_MS) void refresh();
    if (Date.now() - lastHistoryAt >= HISTORY_REFRESH_MS) void refreshHistory();
});

void refresh();
void refreshHistory();

export {};
