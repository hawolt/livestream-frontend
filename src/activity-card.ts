import { API_BASE } from "./api.ts";
import { eventTextLabel, eventTypeClass, eventTypeLabel, mergeFollowEvents, type FollowEvent } from "./dash/activity-events.ts";
import { fmtDate, fmtTime } from "./dash/format.ts";
import { scrubOverlayToken } from "./url-secrets.ts";

const RETRY_MS = 5000;
const AUTH_RETRY_MS = 30000;
const MAX_ROWS = 20;

const stage = document.getElementById("act-stage") as HTMLElement;

let token = "";
let events: FollowEvent[] = [];
let sock: WebSocket | null = null;
let retryTimer: number | null = null;

function parseParams(): void {
    const scrubbed = scrubOverlayToken(location.href);
    token = scrubbed.token;
    if (scrubbed.replacement) history.replaceState(history.state, "", scrubbed.replacement);
}

function render(): void {
    stage.replaceChildren();
    if (events.length === 0) {
        const empty = document.createElement("div");
        empty.className = "act-ev-empty";
        empty.textContent = "No recent activity yet.";
        stage.appendChild(empty);
        return;
    }
    for (const e of events.slice(0, MAX_ROWS)) {
        const row = document.createElement("div");
        row.className = "act-ev";
        const type = document.createElement("span");
        type.className = eventTypeClass(e.type);
        type.textContent = eventTypeLabel(e.type);
        const text = document.createElement("span");
        text.className = "act-ev-text";
        text.textContent = eventTextLabel(e);
        const time = document.createElement("span");
        time.className = "act-ev-time";
        const at = new Date(e.at * 1000);
        time.textContent = `${fmtTime(at)} ${fmtDate(at)}`;
        row.append(type, text, time);
        stage.appendChild(row);
    }
    trimToFit();
}

function trimToFit(): void {
    let guard = MAX_ROWS;
    while (stage.scrollHeight > stage.clientHeight && stage.lastElementChild && guard-- > 0) {
        stage.removeChild(stage.lastElementChild);
    }
}

async function loadSnapshot(): Promise<void> {
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/events/recent?overlay=${encodeURIComponent(token)}&limit=${MAX_ROWS}`);
        if (!res.ok) return;
        const body = await res.json() as { events?: FollowEvent[] };
        if (Array.isArray(body.events)) {
            events = mergeFollowEvents(body.events, events, MAX_ROWS);
            render();
        }
    } catch {}
}

function addLiveEvent(e: FollowEvent): void {
    events = mergeFollowEvents(events, [e], MAX_ROWS);
    render();
}

function toFollowEvent(data: Record<string, unknown>): FollowEvent | null {
    const type = typeof data.type === "string" ? data.type : "";
    const username = typeof data.username === "string" ? data.username : "";
    if (!type || !username) return null;
    const at = typeof data.at === "number" ? data.at : Math.floor(Date.now() / 1000);
    const e: FollowEvent = { type, username, at };
    if (typeof data.viewers === "number") e.viewers = data.viewers;
    if (typeof data.reward === "string") e.detail = data.reward;
    if (typeof data.detail === "string") e.detail = data.detail;
    return e;
}

const LIVE_TYPES = new Set(["follow", "subscription", "raid", "redeem"]);

function normalizeLiveType(type: string): string {
    if (type === "redeem") return "points.redeem";
    return type;
}

function scheduleRetry(delayMs: number): void {
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, delayMs);
}

function connect(): void {
    if (!token) return;
    if (sock && (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/events`);
    sock = s;
    s.onopen = () => {
        if (sock !== s) return;
        s.send(JSON.stringify({ overlay: token }));
    };
    s.onmessage = (ev) => {
        if (sock !== s || typeof ev.data !== "string") return;
        let msg: unknown;
        try {
            msg = JSON.parse(ev.data);
        } catch {
            return;
        }
        if (!msg || typeof msg !== "object") return;
        const data = msg as Record<string, unknown>;
        const type = typeof data.type === "string" ? data.type : "";
        if (!LIVE_TYPES.has(type)) return;
        const event = toFollowEvent(data);
        if (event) {
            event.type = normalizeLiveType(event.type);
            addLiveEvent(event);
        }
    };
    s.onclose = (ev) => {
        if (sock !== s) return;
        sock = null;
        scheduleRetry(ev.code === 4401 ? AUTH_RETRY_MS : RETRY_MS);
    };
    s.onerror = () => s.close();
}

window.addEventListener("resize", () => { if (token) render(); });

parseParams();
if (!token) {
    stage.textContent = "This panel needs its dock URL from the dashboard. Use Copy card url on the Activity tab.";
} else {
    render();
    void loadSnapshot();
    connect();
}
