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

const REFRESH_MS = 30000;

const bannerEl = document.getElementById("status-banner") as HTMLElement;
const updatedEl = document.getElementById("status-updated") as HTMLElement;
const groupsEl = document.getElementById("status-groups") as HTMLElement;

let lastLoadedAt = 0;
let hasData = false;
let loading = false;

function el(tag: string, cls: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function metaEntry(key: string, value: string): HTMLElement {
    const entry = el("span", "svc-meta-entry");
    entry.appendChild(el("span", "svc-meta-key", key));
    entry.appendChild(el("span", "svc-meta-value", value));
    return entry;
}

function serviceRow(service: OverviewService, nowMs: number): HTMLElement {
    const row = el("div", "svc-row");
    const name = el("div", "svc-name");
    name.appendChild(el("span", "svc-label", service.label));
    if (service.region) name.appendChild(el("span", "svc-region", service.region));
    row.appendChild(name);
    const meta = el("div", "svc-meta");
    const latency = formatLatency(service.latencyMs);
    if (latency) meta.appendChild(metaEntry("latency", latency));
    meta.appendChild(metaEntry("24h", formatUptime(service.uptime24h)));
    meta.appendChild(metaEntry("90d", formatUptime(service.uptime90d)));
    const changed = relativeTime(service.lastChange, nowMs);
    if (changed) meta.appendChild(metaEntry("since", changed));
    row.appendChild(meta);
    row.appendChild(el("span", `svc-chip ${service.status}`, statusLabel(service.status)));
    return row;
}

function render(overview: Overview): void {
    const banner = overallBanner(overview.overall);
    bannerEl.className = `status-banner ${banner.cls}`;
    bannerEl.textContent = banner.label;
    groupsEl.textContent = "";
    const nowMs = Date.now();
    for (const group of overview.groups) {
        const card = el("section", "status-card");
        card.appendChild(el("h2", "status-card-title", group.label));
        for (const service of group.services) {
            card.appendChild(serviceRow(service, nowMs));
        }
        groupsEl.appendChild(card);
    }
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
        const overview = parseOverview(await res.json());
        if (!overview) {
            renderError();
            return;
        }
        render(overview);
        hasData = true;
        lastLoadedAt = Date.now();
        updatedEl.textContent = `Last updated ${new Date(lastLoadedAt).toLocaleTimeString()}`;
    } catch {
        renderError();
    } finally {
        loading = false;
    }
}

window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    void refresh();
}, REFRESH_MS);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastLoadedAt >= REFRESH_MS) void refresh();
});

void refresh();

export {};
