import type { LiveInfo, LiveCategory } from "../../api.ts";
import { STREAM_LANGUAGE_OPTIONS, streamLanguageCodes } from "../../stream-languages.ts";
import { attachTypeahead, type TypeaheadOption } from "../../typeahead.ts";
import { esc, fmtDate, fmtTime } from "../format.ts";
import { authFetch, getMe, token } from "../session.ts";
import { countNewLiveEvents, eventTypeClass, followEventKey, mergeFollowEvents, rejectEventLabel, viewerCountLabel, type FollowEvent } from "../activity-events.ts";

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
let viewerLive: boolean | null = null;
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
    countEl.textContent = viewerCountLabel(viewerCount, viewerLive);
}

function renderFollowerCount(): void {
    const el = document.getElementById("act-follower-count");
    if (!el) return;
    el.textContent = followerCount === null ? "-" : String(followerCount);
}

function buildEventRow(e: FollowEvent): HTMLElement {
    const at = dateOf(e.at);
    const row = document.createElement("div");
    row.className = "act-ev";
    const type = document.createElement("span");
    type.className = eventTypeClass(e.type);
    type.textContent = e.type === "reject" ? "STREAM" : e.type.toUpperCase();
    const text = document.createElement("span");
    text.className = "act-ev-text";
    let label = e.username;
    if (e.type === "raid" && typeof e.viewers === "number") {
        label = `${e.username} with ${e.viewers} ${e.viewers === 1 ? "viewer" : "viewers"}`;
    } else if (e.type === "reject") {
        label = rejectEventLabel(e);
    }
    text.textContent = label;
    text.title = label;
    if (e.type === "reject") {
        text.appendChild(document.createTextNode(" "));
        const link = document.createElement("a");
        link.href = "/wiki#obs";
        link.target = "_blank";
        link.rel = "noopener";
        link.className = "act-ev-link";
        link.textContent = "Stream limits";
        text.appendChild(link);
    }
    const time = document.createElement("span");
    time.className = "act-ev-time";
    time.textContent = `${fmtTime(at)} ${fmtDate(at)}`;
    row.append(type, text, time);
    return row;
}

function buildEventsNote(message: string): HTMLElement {
    const note = document.createElement("div");
    note.className = "act-ev-empty";
    note.textContent = message;
    return note;
}

function renderEvents(): void {
    const body = document.getElementById("act-events-body");
    if (!body) return;
    if (!events.length) {
        body.replaceChildren(buildEventsNote("No activity yet."));
        return;
    }
    body.replaceChildren(...events.map(buildEventRow));
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
        const res = await authFetch<RecentFollowsResponse>("/api/events/recent?limit=20");
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
        if (body) body.replaceChildren(buildEventsNote("Could not load recent activity."));
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
            from?: string;
            at?: number;
            viewers?: number;
            live?: boolean;
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
        } else if (msg.type === "raid" && msg.from && typeof msg.at === "number") {
            const event: FollowEvent = {
                type: "raid",
                username: msg.from,
                at: msg.at,
                viewers: typeof msg.viewers === "number" ? msg.viewers : undefined,
            };
            if (recentSnapshotPending) liveEvents.set(followEventKey(event), event);
            if (addEvent(event)) playFollowSound();
        } else if (msg.type === "viewcount" && typeof msg.viewers === "number") {
            viewerCount = msg.viewers;
            viewerLive = typeof msg.live === "boolean" ? msg.live : null;
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
    const currentCodes = streamLanguageCodes(liveCache.language);
    const primaryCode = currentCodes[0] ?? "und";
    const secondaryCode = currentCodes[1] ?? "und";
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Title</span><input id="live-info-title" type="text" maxlength="200" placeholder="Now streaming..." value="${esc(liveCache.title)}"></label>
            <label><span>Category</span><input id="live-info-category" type="text" placeholder="Other (no category)"></label>
            <label><span>Language</span><input id="live-info-language" type="text" placeholder="Unspecified"></label>
            <label><span>Second language</span><input id="live-info-language2" type="text" placeholder="None"></label>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
            Shown with your stream on the channel page and explorer. Categories are also used to group streams.
        </div>
        <div id="live-info-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div class="card-actions" style="align-items:center">
            <button class="btn btn-primary" id="btn-live-info-save">Save Stream Info</button>
            <span id="live-info-saved" style="font-size:13px;color:var(--success)"></span>
        </div>`;
    const categoryOptions: TypeaheadOption[] = [{ value: "", label: "Other (no category)" }]
        .concat(categoriesCache.map(c => ({ value: String(c.id), label: c.name })));
    const categoryField = attachTypeahead(
        document.getElementById("live-info-category") as HTMLInputElement, categoryOptions);
    categoryField.setValue(liveCache.categoryId === null ? "" : String(liveCache.categoryId));

    const primaryOptions: TypeaheadOption[] = STREAM_LANGUAGE_OPTIONS.map(({ code, label }) =>
        ({ value: code, label }));
    const secondaryOptions: TypeaheadOption[] = STREAM_LANGUAGE_OPTIONS.map(({ code, label }) =>
        ({ value: code, label: code === "und" ? "None" : label }));
    const primaryField = attachTypeahead(
        document.getElementById("live-info-language") as HTMLInputElement, primaryOptions);
    primaryField.setValue(primaryCode);
    const secondaryField = attachTypeahead(
        document.getElementById("live-info-language2") as HTMLInputElement, secondaryOptions);
    secondaryField.setValue(secondaryCode);

    document.getElementById("btn-live-info-save")?.addEventListener("click", async () => {
        if (!liveCache) return;
        const btn = document.getElementById("btn-live-info-save") as HTMLButtonElement;
        const errEl = document.getElementById("live-info-error")!;
        const savedEl = document.getElementById("live-info-saved")!;
        const title = (document.getElementById("live-info-title") as HTMLInputElement).value;
        const catVal = categoryField.value();
        const categoryId = catVal === "" ? null : Number(catVal);
        const codes = [primaryField.value(), secondaryField.value()]
            .filter((code, i, all) => code !== "und" && all.indexOf(code) === i);
        const language = codes.length ? codes.join(",") : "und";
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
const SHOW_TIME_KEY = "activity_show_time";
const DEFAULT_ALERT_SOUND_URL = "/static/sounds/default_alert.mp3";
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

function showTimePrefOn(): boolean {
    try {
        return localStorage.getItem(SHOW_TIME_KEY) !== "0";
    } catch {
        return true;
    }
}

function applyTimePref(): void {
    const pane = document.getElementById("pane-activity");
    if (pane) pane.classList.toggle("act-hide-time", !showTimePrefOn());
}

function soundPrefOn(): boolean {
    try {
        return localStorage.getItem(SOUND_PREF_KEY) !== "0";
    } catch {
        return true;
    }
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
        alertAudio = new Audio(`/api/live/alert-sound/${encodeURIComponent(me.toLowerCase())}/follow`);
        alertAudio.onerror = () => {
            const audio = alertAudio;
            if (!audio) return;
            if (audio.src.endsWith(DEFAULT_ALERT_SOUND_URL)) {
                alertAudioFailed = true;
                return;
            }
            audio.src = DEFAULT_ALERT_SOUND_URL;
            audio.load();
        };
    }
    alertAudio.volume = volume / 100;
    try {
        alertAudio.currentTime = 0;
    } catch {}
    void alertAudio.play().catch(() => {});
}

export function init(): void {
    const soundButton = document.getElementById("act-sound-settings");
    const soundPop = document.getElementById("act-sound-pop");
    soundButton?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        soundPop?.classList.toggle("open");
    });
    document.addEventListener("pointerdown", (ev) => {
        if (!soundPop?.classList.contains("open")) return;
        const wrap = soundButton?.parentElement;
        if (wrap && ev.target instanceof Node && !wrap.contains(ev.target)) {
            soundPop.classList.remove("open");
        }
    });
    const soundOn = document.getElementById("act-sound-on") as HTMLInputElement | null;
    if (soundOn) {
        soundOn.checked = soundPrefOn();
        soundOn.addEventListener("change", () => {
            try {
                localStorage.setItem(SOUND_PREF_KEY, soundOn.checked ? "1" : "0");
            } catch {}
        });
    }
    const showTime = document.getElementById("act-show-time") as HTMLInputElement | null;
    if (showTime) {
        showTime.checked = showTimePrefOn();
        showTime.addEventListener("change", () => {
            try {
                localStorage.setItem(SHOW_TIME_KEY, showTime.checked ? "1" : "0");
            } catch {}
            applyTimePref();
        });
    }
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
    applyTimePref();
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
