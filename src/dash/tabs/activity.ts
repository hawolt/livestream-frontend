import type { LiveInfo, LiveCategory } from "../../api.ts";
import { STREAM_LANGUAGE_OPTIONS, type StreamLanguageCode } from "../../stream-languages.ts";
import { esc, fmtDate, fmtTime } from "../format.ts";
import { authFetch, getMe, token } from "../session.ts";
import { countNewLiveEvents, followEventKey, mergeFollowEvents, type FollowEvent } from "../activity-events.ts";

interface RecentFollowsResponse {
    events: FollowEvent[];
    count: number;
}

const MAX_EVENTS = 50;
const CONCEAL_KEY = "activity_viewer_concealed";
const RECONNECT_MS = 5000;

const dateOf = (t: number): Date => new Date(t * 1000);

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
let activationGeneration = 0;
let liveEvents = new Map<string, FollowEvent>();
let recentSnapshotPending = false;

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
    const at = dateOf(e.at);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span><b>${esc(e.username)}</b> followed</span>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap;font-family:var(--font-mono)">${fmtTime(at)} ${fmtDate(at)}</span>
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

function addEvent(e: FollowEvent): boolean {
    const key = followEventKey(e);
    if (events.some(event => followEventKey(event) === key)) return false;
    events.unshift(e);
    events.sort((a, b) => b.at - a.at);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    renderEvents();
    return true;
}

async function loadRecentFollows(generation: number): Promise<void> {
    try {
        const res = await authFetch<RecentFollowsResponse>("/api/follows/recent?limit=20");
        if (eventsDead || generation !== activationGeneration) return;
        const currentLiveEvents = Array.from(liveEvents.values());
        events = mergeFollowEvents(res.events, currentLiveEvents, MAX_EVENTS);
        followerCount = res.count + countNewLiveEvents(res.events, currentLiveEvents);
        recentSnapshotPending = false;
        liveEvents.clear();
        renderEvents();
        renderFollowerCount();
    } catch {
        if (eventsDead || generation !== activationGeneration) return;
        recentSnapshotPending = false;
        liveEvents.clear();
        if (events.length) return;
        const body = document.getElementById("act-events-body");
        if (body) body.innerHTML = `<div style="color:var(--muted);padding:10px 0">Could not load recent activity.</div>`;
    }
}

function connectEvents(generation: number): void {
    if (eventsDead || generation !== activationGeneration) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/events`);
    eventsWs = ws;
    ws.onopen = () => {
        if (eventsWs === ws && !eventsDead && generation === activationGeneration) {
            ws.send(JSON.stringify({ token: token() }));
        }
    };
    ws.onmessage = (e: MessageEvent) => {
        if (eventsWs !== ws || eventsDead || generation !== activationGeneration) return;
        let msg: {
            type: string;
            username?: string;
            at?: number;
            viewers?: number;
            test?: boolean;
        };
        try {
            msg = JSON.parse(e.data as string) as typeof msg;
        } catch {
            return;
        }
        if (msg.test) return;
        if (msg.type === "follow" && msg.username && typeof msg.at === "number") {
            const event = { type: "follow", username: msg.username, at: msg.at };
            if (recentSnapshotPending) liveEvents.set(followEventKey(event), event);
            if (addEvent(event)) {
                playFollowSound();
                if (followerCount !== null) {
                    followerCount += 1;
                    renderFollowerCount();
                }
            }
        } else if (msg.type === "viewcount" && typeof msg.viewers === "number") {
            viewerCount = msg.viewers;
            renderViewerChip();
        } else if (msg.type === "error") {
            ws.close();
        }
    };
    ws.onclose = () => {
        if (eventsWs !== ws || generation !== activationGeneration) return;
        eventsWs = null;
        if (!eventsDead) eventsReconnectTimer = window.setTimeout(() => connectEvents(generation), RECONNECT_MS);
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

async function loadLive(generation: number): Promise<void> {
    const el = document.getElementById("live-info-body");
    if (el) el.textContent = "Loading...";
    try {
        const [info, cats] = await Promise.all([
            authFetch<LiveInfo>("/api/live"),
            authFetch<{ categories: LiveCategory[] }>("/api/live/categories"),
        ]);
        if (eventsDead || generation !== activationGeneration) return;
        liveCache = info;
        categoriesCache = cats.categories;
        renderInfo();
    } catch (e) {
        if (eventsDead || generation !== activationGeneration) return;
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

const SOUND_PREF_KEY = "activity_sound";
const SOUND_VOLUME_KEY = "activity_sound_volume";
const SOUND_MIN_GAP_MS = 1500;
let alertAudio: HTMLAudioElement | null = null;
let alertAudioFailed = false;
let lastSoundAt = 0;

function soundVolumePct(): number {
    try {
        const raw = localStorage.getItem(SOUND_VOLUME_KEY);
        if (raw === null) return 100;
        const v = Number(raw);
        return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 100;
    } catch {
        return 100;
    }
}

function soundPrefOn(): boolean {
    try {
        return localStorage.getItem(SOUND_PREF_KEY) !== "0";
    } catch {
        return true;
    }
}

function renderSoundToggle(): void {
    const btn = document.getElementById("act-sound-toggle");
    if (btn) btn.textContent = soundPrefOn() ? "Sound: on" : "Sound: off";
}

function playFollowSound(): void {
    if (!soundPrefOn() || alertAudioFailed) return;
    const volume = soundVolumePct();
    if (volume <= 0) return;
    const now = Date.now();
    if (now - lastSoundAt < SOUND_MIN_GAP_MS) return;
    lastSoundAt = now;
    if (!alertAudio) {
        const me = getMe()?.username;
        if (!me) return;
        alertAudio = new Audio(`/api/live/alert-sound/${encodeURIComponent(me.toLowerCase())}`);
        alertAudio.onerror = () => {
            alertAudioFailed = true;
        };
    }
    alertAudio.volume = volume / 100;
    try {
        alertAudio.currentTime = 0;
    } catch {}
    void alertAudio.play().catch(() => {});
}

export function init(): void {
    const soundToggle = document.getElementById("act-sound-toggle");
    soundToggle?.addEventListener("click", () => {
        try {
            localStorage.setItem(SOUND_PREF_KEY, soundPrefOn() ? "0" : "1");
        } catch {}
        renderSoundToggle();
    });
    renderSoundToggle();
    const volumeInput = document.getElementById("act-sound-volume") as HTMLInputElement | null;
    if (volumeInput) {
        volumeInput.value = String(soundVolumePct());
        volumeInput.addEventListener("input", () => {
            const v = Number(volumeInput.value);
            if (!Number.isFinite(v) || v < 0 || v > 100) return;
            try {
                localStorage.setItem(SOUND_VOLUME_KEY, String(Math.round(v)));
            } catch {}
            if (alertAudio) alertAudio.volume = v / 100;
        });
    }
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
    const generation = ++activationGeneration;
    alertAudio = null;
    alertAudioFailed = false;
    liveEvents = new Map();
    recentSnapshotPending = true;
    loadChat();
    eventsDead = false;
    void loadRecentFollows(generation);
    void loadLive(generation);
    connectEvents(generation);
}

export function deactivate(): void {
    eventsDead = true;
    activationGeneration += 1;
    recentSnapshotPending = false;
    liveEvents.clear();
    if (eventsReconnectTimer !== null) {
        window.clearTimeout(eventsReconnectTimer);
        eventsReconnectTimer = null;
    }
    eventsWs?.close();
    eventsWs = null;
    const iframe = document.getElementById("act-chat-iframe") as HTMLIFrameElement | null;
    if (iframe) iframe.src = "about:blank";
    chatLoaded = false;
}
