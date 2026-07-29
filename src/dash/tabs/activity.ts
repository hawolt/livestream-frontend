import { authFetch, esc, fmtDate, getMe, token } from "../core.ts";

interface FollowEvent {
    type: string;
    username: string;
    at: number;
}

interface RecentFollowsResponse {
    events: FollowEvent[];
    count: number;
}

const MAX_EVENTS = 50;
const CONCEAL_KEY = "activity_viewer_concealed";
const RECONNECT_MS = 5000;

const fmtUnix = (t: number): string => fmtDate(new Date(t * 1000).toISOString());

let concealed = sessionStorage.getItem(CONCEAL_KEY) === "1";
let events: FollowEvent[] = [];
let followerCount: number | null = null;
let viewerCount: number | null = null;
let chatLoaded = false;

let eventsWs: WebSocket | null = null;
let eventsReconnectTimer: number | null = null;
let eventsDead = true;

function renderViewerChip(): void {
    const countEl = document.getElementById("act-viewer-count");
    const hintEl = document.getElementById("act-viewer-hint");
    if (!countEl || !hintEl) return;
    if (concealed) {
        countEl.textContent = "•••";
        hintEl.textContent = "Click to reveal";
        return;
    }
    hintEl.textContent = "Click to hide";
    if (viewerCount === null) {
        countEl.textContent = "-";
    } else if (viewerCount === 0) {
        countEl.textContent = "Offline";
    } else {
        countEl.textContent = String(viewerCount);
    }
}

function renderFollowerCount(): void {
    const el = document.getElementById("act-follower-count");
    if (!el) return;
    el.textContent = followerCount === null ? "-" : String(followerCount);
}

function eventRowHtml(e: FollowEvent): string {
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span><b>${esc(e.username)}</b> followed</span>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap">${fmtUnix(e.at)}</span>
    </div>`;
}

function renderEvents(): void {
    const body = document.getElementById("act-events-body");
    if (!body) return;
    if (!events.length) {
        body.innerHTML = `<div style="color:var(--muted);padding:10px 0">No follows yet.</div>`;
        return;
    }
    body.innerHTML = events.map(eventRowHtml).join("");
}

function addEvent(e: FollowEvent): void {
    events.unshift(e);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    renderEvents();
}

async function loadRecentFollows(): Promise<void> {
    try {
        const res = await authFetch<RecentFollowsResponse>("/api/follows/recent?limit=20");
        events = res.events.slice(0, MAX_EVENTS);
        followerCount = res.count;
        renderEvents();
        renderFollowerCount();
    } catch {
        const body = document.getElementById("act-events-body");
        if (body) body.innerHTML = `<div style="color:var(--muted);padding:10px 0">Could not load recent activity.</div>`;
    }
}

function connectEvents(): void {
    if (eventsDead) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/events`);
    eventsWs = ws;
    ws.onopen = () => ws.send(JSON.stringify({ token: token() }));
    ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data as string) as {
            type: string;
            username?: string;
            at?: number;
            viewers?: number;
        };
        if (msg.type === "follow" && msg.username && typeof msg.at === "number") {
            addEvent({ type: "follow", username: msg.username, at: msg.at });
            if (followerCount !== null) {
                followerCount += 1;
                renderFollowerCount();
            }
        } else if (msg.type === "viewcount" && typeof msg.viewers === "number") {
            viewerCount = msg.viewers;
            renderViewerChip();
        } else if (msg.type === "error") {
            ws.close();
        }
    };
    ws.onclose = () => {
        if (eventsWs !== ws) return;
        eventsWs = null;
        if (!eventsDead) eventsReconnectTimer = window.setTimeout(connectEvents, RECONNECT_MS);
    };
}

function loadChat(): void {
    if (chatLoaded) return;
    const iframe = document.getElementById("act-chat-iframe") as HTMLIFrameElement | null;
    if (!iframe) return;
    const username = getMe()?.username;
    if (!username) return;
    iframe.src = `/${encodeURIComponent(username.toLowerCase())}?chat=popout`;
    chatLoaded = true;
}

export function init(): void {
    const chip = document.getElementById("act-viewer-chip");
    chip?.addEventListener("click", () => {
        concealed = !concealed;
        sessionStorage.setItem(CONCEAL_KEY, concealed ? "1" : "0");
        renderViewerChip();
    });
    renderViewerChip();
    renderFollowerCount();
    renderEvents();
}

export function activate(): void {
    loadChat();
    void loadRecentFollows();

    eventsDead = false;
    connectEvents();
}

export function deactivate(): void {
    eventsDead = true;
    if (eventsReconnectTimer !== null) {
        window.clearTimeout(eventsReconnectTimer);
        eventsReconnectTimer = null;
    }
    eventsWs?.close();
    eventsWs = null;
}
