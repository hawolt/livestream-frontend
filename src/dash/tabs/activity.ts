import type { LiveInfo, LiveCategory } from "../../api.ts";
import { STREAM_LANGUAGE_OPTIONS, type StreamLanguageCode } from "../../stream-languages.ts";
import { authFetch, esc, fmtDate, fmtTime, getMe, token } from "../core.ts";

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

const isoOf = (t: number): string => new Date(t * 1000).toISOString();

let concealed = sessionStorage.getItem(CONCEAL_KEY) === "1";
let events: FollowEvent[] = [];
let followerCount: number | null = null;
let viewerCount: number | null = null;
let chatLoaded = false;

let liveCache: LiveInfo | null = null;
let categoriesCache: LiveCategory[] = [];

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
    const iso = isoOf(e.at);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span><b>${esc(e.username)}</b> followed</span>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap">${fmtTime(iso)} ${fmtDate(iso)}</span>
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
            test?: boolean;
        };
        if (msg.test) return;
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

async function loadLive(): Promise<void> {
    const el = document.getElementById("live-info-body");
    if (el) el.textContent = "Loading...";
    try {
        const [info, cats] = await Promise.all([
            authFetch<LiveInfo>("/api/live"),
            authFetch<{ categories: LiveCategory[] }>("/api/live/categories"),
        ]);
        liveCache = info;
        categoriesCache = cats.categories;
        renderInfo();
    } catch (e) {
        if (el) el.textContent = String(e);
    }
}

function renderInfo(): void {
    const el = document.getElementById("live-info-body");
    if (!el || !liveCache) return;
    const options = [`<option value="" ${liveCache.categoryId === null ? "selected" : ""}>No category</option>`]
        .concat(categoriesCache.map(c =>
            `<option value="${c.id}" ${liveCache!.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`));
    const languageOptions = STREAM_LANGUAGE_OPTIONS.map(({ code, label }) =>
        `<option value="${code}" ${liveCache!.language === code ? "selected" : ""}>${esc(label)}</option>`);
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Title</span><input id="live-info-title" type="text" maxlength="200" placeholder="Now streaming..." value="${esc(liveCache.title)}"></label>
            <label><span>Category</span><select id="live-info-category">${options.join("")}</select></label>
            <label><span>Language</span><select id="live-info-language">${languageOptions.join("")}</select></label>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
            Shown with your stream on the channel page and explorer. Categories are also used to group streams.
        </div>
        <div id="live-info-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
            <button class="btn btn-primary" id="btn-live-info-save">Save Stream Info</button>
            <span id="live-info-saved" style="font-size:13px;color:var(--success)"></span>
        </div>`;
    document.getElementById("btn-live-info-save")?.addEventListener("click", async () => {
        if (!liveCache) return;
        const btn = document.getElementById("btn-live-info-save") as HTMLButtonElement;
        const errEl = document.getElementById("live-info-error")!;
        const savedEl = document.getElementById("live-info-saved")!;
        const title = (document.getElementById("live-info-title") as HTMLInputElement).value;
        const catVal = (document.getElementById("live-info-category") as HTMLSelectElement).value;
        const categoryId = catVal === "" ? null : Number(catVal);
        const language = (document.getElementById("live-info-language") as HTMLSelectElement).value as StreamLanguageCode;
        errEl.textContent = "";
        savedEl.textContent = "";
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/info", {
                method: "PUT",
                body: JSON.stringify({ title, categoryId, language }),
            });
            renderInfo();
            const savedNow = document.getElementById("live-info-saved");
            if (savedNow) {
                savedNow.textContent = "Saved";
                setTimeout(() => { savedNow.textContent = ""; }, 2500);
            }
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            btn.disabled = false;
        }
    });
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
    void loadLive();

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
