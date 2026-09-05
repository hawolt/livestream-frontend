import type { LiveInfo, LiveCategory } from "../../api.ts";
import { STREAM_LANGUAGE_OPTIONS, streamLanguageCodes } from "../../stream-languages.ts";
import { attachTypeahead, type TypeaheadOption } from "../../typeahead.ts";
import { esc, fmtDate, fmtTime } from "../format.ts";
import { authFetch, getMe, token } from "../session.ts";
import { countNewFollowerEvents, eventTextLabel, eventTypeClass, eventTypeLabel, followEventKey, isStreamEvent, mergeFollowEvents, viewerCountLabel, type FollowEvent } from "../activity-events.ts";
import {
    ACTIVITY_BLOCK_IDS,
    ACTIVITY_LAYOUT_KEY,
    DEFAULT_ACTIVITY_LAYOUT,
    HANDLE_PX,
    cloneActivityLayout,
    colMinsFor,
    dragAdjustCols,
    dragAdjustRows,
    fitColSizes,
    fitRowSizes,
    parseActivityLayout,
    rowMinsFor,
    swapBlocks,
    type ActivityBlockId,
    type ActivityLayoutState,
} from "../activity-layout.ts";
import { shouldPreviewRun } from "../activity-preview.ts";
import { wireCopy } from "../overlay-shared.ts";

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

let layoutState: ActivityLayoutState = cloneActivityLayout(DEFAULT_ACTIVITY_LAYOUT);
const desktopMedia = window.matchMedia("(min-width: 901px)");

const SLOT_PLACEMENT: { col: string; row: string }[] = [
    { col: "1", row: "1 / 6" },
    { col: "3", row: "1" },
    { col: "3", row: "3" },
    { col: "3", row: "5" },
];
const SLOT_CLASSES = ["act-slot-wide", "act-slot-narrow-top", "act-slot-narrow-mid", "act-slot-narrow-bottom"];

function isDesktopLayout(): boolean {
    return desktopMedia.matches;
}

function blockEl(id: ActivityBlockId): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.act-block[data-block="${id}"]`);
}

function loadLayout(): void {
    try {
        const raw = localStorage.getItem(ACTIVITY_LAYOUT_KEY);
        if (!raw) return;
        const parsed = parseActivityLayout(JSON.parse(raw));
        if (parsed) layoutState = parsed;
    } catch {}
}

function saveLayout(): void {
    try {
        localStorage.setItem(ACTIVITY_LAYOUT_KEY, JSON.stringify(layoutState));
    } catch {}
}

function applyBlockPlacement(order: ActivityBlockId[]): void {
    order.forEach((id, i) => {
        const el = blockEl(id);
        const slot = SLOT_PLACEMENT[i];
        if (!el || !slot) return;
        el.style.gridColumn = slot.col;
        el.style.gridRow = slot.row;
        SLOT_CLASSES.forEach((cls, si) => el.classList.toggle(cls, si === i));
    });
}

function applyTrackSizes(state: ActivityLayoutState): void {
    const container = document.getElementById("act-layout");
    if (!container) return;
    const [minWide, minNarrow] = colMinsFor(state.order);
    const [minR1, minR2, minR3] = rowMinsFor(state.order);
    const colTotal = container.clientWidth;
    const rowTotal = container.clientHeight;
    const [wide, narrow] = colTotal > 0
        ? fitColSizes(state.colSizes, state.order, colTotal - HANDLE_PX)
        : state.colSizes;
    const [r1, r2, r3] = rowTotal > 0
        ? fitRowSizes(state.rowSizes, state.order, rowTotal - HANDLE_PX * 2)
        : state.rowSizes;
    state.colSizes = [wide, narrow];
    state.rowSizes = [r1, r2, r3];
    container.style.gridTemplateColumns = `minmax(${minWide}px, ${wide}fr) ${HANDLE_PX}px minmax(${minNarrow}px, ${narrow}fr)`;
    container.style.gridTemplateRows =
        `minmax(${minR1}px, ${r1}fr) ${HANDLE_PX}px minmax(${minR2}px, ${r2}fr) ${HANDLE_PX}px minmax(${minR3}px, ${r3}fr)`;
}

function applyLayout(): void {
    if (!isDesktopLayout()) return;
    applyBlockPlacement(layoutState.order);
    applyTrackSizes(layoutState);
}

function setIframesInert(inert: boolean): void {
    const chat = document.getElementById("act-chat-iframe") as HTMLIFrameElement | null;
    if (chat) chat.style.pointerEvents = inert ? "none" : "";
    if (previewIframe) previewIframe.style.pointerEvents = inert ? "none" : "";
}

function clearDropTargets(): void {
    document.querySelectorAll(".act-drop-target").forEach(el => el.classList.remove("act-drop-target"));
}

function startReorderDrag(sourceId: ActivityBlockId, startEv: PointerEvent): void {
    const sourceEl = blockEl(sourceId);
    if (!sourceEl) return;
    let targetId: ActivityBlockId | null = null;
    sourceEl.classList.add("act-dragging");
    setIframesInert(true);
    document.body.style.userSelect = "none";

    const findTarget = (x: number, y: number): ActivityBlockId | null => {
        for (const id of ACTIVITY_BLOCK_IDS) {
            if (id === sourceId) continue;
            const el = blockEl(id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
        }
        return null;
    };

    const onMove = (ev: PointerEvent): void => {
        clearDropTargets();
        targetId = findTarget(ev.clientX, ev.clientY);
        if (targetId) blockEl(targetId)?.classList.add("act-drop-target");
    };

    const finish = (): void => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        sourceEl.classList.remove("act-dragging");
        clearDropTargets();
        setIframesInert(false);
        document.body.style.userSelect = "";
        if (targetId && targetId !== sourceId) {
            layoutState.order = swapBlocks(layoutState.order, sourceId, targetId);
            applyBlockPlacement(layoutState.order);
            saveLayout();
        }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
}

function wireReorderDrag(): void {
    document.querySelectorAll<HTMLElement>(".act-drag-handle, .act-block-handle").forEach(handle => {
        handle.addEventListener("pointerdown", (ev) => {
            if (!isDesktopLayout() || ev.button !== 0) return;
            const sourceId = handle.dataset["block"] as ActivityBlockId | undefined;
            if (!sourceId) return;
            ev.preventDefault();
            startReorderDrag(sourceId, ev);
        });
    });
}

function trackPixelSizes(value: string): number[] {
    return value.trim().split(/\s+/).filter(Boolean).map(v => parseFloat(v));
}

function beginColResize(startEv: PointerEvent): void {
    const container = document.getElementById("act-layout");
    if (!container) return;
    const cols = trackPixelSizes(getComputedStyle(container).gridTemplateColumns);
    const startSizes: [number, number] = [cols[0] ?? 0, cols[2] ?? 0];
    const [minWide, minNarrow] = colMinsFor(layoutState.order);
    if (startSizes[0] + startSizes[1] <= minWide + minNarrow) return;
    layoutState.colSizes = startSizes;
    const startX = startEv.clientX;
    const handle = startEv.currentTarget as HTMLElement | null;
    handle?.classList.add("act-handle-active");
    setIframesInert(true);
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent): void {
        const dx = ev.clientX - startX;
        layoutState.colSizes = dragAdjustCols(startSizes, layoutState.order, dx);
        applyTrackSizes(layoutState);
    }

    function finish(): void {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        handle?.classList.remove("act-handle-active");
        setIframesInert(false);
        document.body.style.userSelect = "";
        saveLayout();
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
}

function beginRowResize(startEv: PointerEvent, indexA: 0 | 1, indexB: 0 | 1 | 2): void {
    const container = document.getElementById("act-layout");
    if (!container) return;
    const rows = trackPixelSizes(getComputedStyle(container).gridTemplateRows);
    const rowTrackIndex = [0, 2, 4];
    const startSizes: [number, number, number] = [
        rows[rowTrackIndex[0]!] ?? 0,
        rows[rowTrackIndex[1]!] ?? 0,
        rows[rowTrackIndex[2]!] ?? 0,
    ];
    const rowMins = rowMinsFor(layoutState.order);
    if (startSizes[indexA] + startSizes[indexB] <= rowMins[indexA] + rowMins[indexB]) return;
    layoutState.rowSizes = startSizes;
    const startY = startEv.clientY;
    const handle = startEv.currentTarget as HTMLElement | null;
    handle?.classList.add("act-handle-active");
    setIframesInert(true);
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent): void {
        const dy = ev.clientY - startY;
        layoutState.rowSizes = dragAdjustRows(startSizes, layoutState.order, indexA, indexB, dy);
        applyTrackSizes(layoutState);
    }

    function finish(): void {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        handle?.classList.remove("act-handle-active");
        setIframesInert(false);
        document.body.style.userSelect = "";
        saveLayout();
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
}

function wireResizeHandles(): void {
    document.getElementById("act-col-handle")?.addEventListener("pointerdown", (ev) => {
        if (!isDesktopLayout() || ev.button !== 0) return;
        ev.preventDefault();
        beginColResize(ev);
    });
    document.getElementById("act-row-handle-1")?.addEventListener("pointerdown", (ev) => {
        if (!isDesktopLayout() || ev.button !== 0) return;
        ev.preventDefault();
        beginRowResize(ev, 0, 1);
    });
    document.getElementById("act-row-handle-2")?.addEventListener("pointerdown", (ev) => {
        if (!isDesktopLayout() || ev.button !== 0) return;
        ev.preventDefault();
        beginRowResize(ev, 1, 2);
    });
}

function wireLayout(): void {
    loadLayout();
    wireReorderDrag();
    wireResizeHandles();
    applyLayout();
    desktopMedia.addEventListener("change", applyLayout);
    document.getElementById("act-reset-layout")?.addEventListener("click", () => {
        layoutState = cloneActivityLayout(DEFAULT_ACTIVITY_LAYOUT);
        saveLayout();
        applyLayout();
    });
}

let previewOn = false;
let previewIframe: HTMLIFrameElement | null = null;
let previewObserver: IntersectionObserver | null = null;
let previewCardVisible = false;
let previewSrcSet = false;
let tabActive = false;

function updatePreviewButton(): void {
    const btn = document.getElementById("act-preview-toggle") as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = !liveCache;
    btn.textContent = previewOn ? "Stop preview" : "Live preview";
    btn.classList.toggle("btn-primary", previewOn);
    btn.setAttribute("aria-pressed", previewOn ? "true" : "false");
}

function syncPreviewIframe(): void {
    if (!previewIframe) return;
    const shouldRun = shouldPreviewRun({
        toggledOn: previewOn,
        tabActive,
        documentVisible: document.visibilityState === "visible",
        cardVisible: previewCardVisible,
    });
    if (shouldRun) {
        if (!previewSrcSet) {
            const username = getMe()?.username;
            if (!username) return;
            previewIframe.src = `/embed/${encodeURIComponent(username.toLowerCase())}?preview=1`;
            previewSrcSet = true;
        }
    } else if (previewSrcSet) {
        previewIframe.src = "about:blank";
        previewSrcSet = false;
    }
}

function observePreviewCard(): void {
    previewObserver?.disconnect();
    const card = blockEl("info");
    if (!card) return;
    previewObserver = new IntersectionObserver((entries) => {
        previewCardVisible = entries.some(entry => entry.isIntersecting);
        syncPreviewIframe();
    }, { threshold: 0 });
    previewObserver.observe(card);
}

function unobservePreviewCard(): void {
    previewObserver?.disconnect();
    previewObserver = null;
    previewCardVisible = false;
}

function mountPreview(): void {
    const el = document.getElementById("live-info-body");
    if (!el) return;
    el.replaceChildren();
    const frame = document.createElement("iframe");
    frame.title = "Your stream preview";
    frame.style.cssText = "width:100%;aspect-ratio:16/9;border:0;display:block;background:#000";
    frame.allow = "autoplay";
    el.appendChild(frame);
    previewIframe = frame;
    previewSrcSet = false;
    observePreviewCard();
    syncPreviewIframe();
}

function unmountPreview(): void {
    if (previewIframe) previewIframe.src = "about:blank";
    previewIframe = null;
    previewSrcSet = false;
    unobservePreviewCard();
    renderInfo();
}

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
    const streamEvent = isStreamEvent(e.type);
    type.textContent = eventTypeLabel(e.type);
    const text = document.createElement("span");
    text.className = "act-ev-text";
    const label = eventTextLabel(e);
    text.textContent = label;
    text.title = label;
    if (streamEvent) {
        text.appendChild(document.createTextNode(" "));
        const link = document.createElement("a");
        link.href = "/guides/obs-setup";
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
        followerCount = res.count + countNewFollowerEvents(res.events, currentLiveEvents);
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
        updatePreviewButton();
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

let overlayToken: string | null = null;

function activityCardUrl(): string {
    const user = getMe()?.username;
    if (!user || !overlayToken) return "";
    return `${location.origin}/activity/${encodeURIComponent(user.toLowerCase())}#token=${overlayToken}`;
}

function infoCardUrl(): string {
    const user = getMe()?.username;
    if (!user) return "";
    return `${location.origin}/info/${encodeURIComponent(user.toLowerCase())}`;
}

function wirePopover(buttonId: string, popId: string): void {
    const button = document.getElementById(buttonId);
    const pop = document.getElementById(popId);
    button?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        pop?.classList.toggle("open");
    });
    document.addEventListener("pointerdown", (ev) => {
        if (!pop?.classList.contains("open")) return;
        const wrap = button?.parentElement;
        if (wrap && ev.target instanceof Node && !wrap.contains(ev.target)) {
            pop.classList.remove("open");
        }
    });
}

function initCardUrls(): void {
    wirePopover("act-info-settings", "act-info-pop");
    wireCopy("act-copy-activity-url", activityCardUrl);
    wireCopy("act-copy-info-url", infoCardUrl);
    void authFetch<{ overlayToken?: string }>("/api/settings").then((s) => {
        overlayToken = typeof s.overlayToken === "string" ? s.overlayToken : null;
        const copyBtn = document.getElementById("act-copy-activity-url") as HTMLButtonElement | null;
        if (copyBtn) copyBtn.disabled = overlayToken === null;
    }).catch(() => {});
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
    initCardUrls();
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
    document.getElementById("act-preview-toggle")?.addEventListener("click", () => {
        previewOn = !previewOn;
        updatePreviewButton();
        if (previewOn) mountPreview();
        else unmountPreview();
    });
    document.addEventListener("visibilitychange", syncPreviewIframe);
    updatePreviewButton();
    wireLayout();
    renderViewerChip();
    renderFollowerCount();
    renderEvents();
}

export function activate(): void {
    const generation = ++activationGeneration;
    applyTimePref();
    applyLayout();
    alertAudio = null;
    alertAudioFailed = false;
    liveEvents = new Map();
    recentSnapshotPending = true;
    loadChat();
    eventsDead = false;
    tabActive = true;
    syncPreviewIframe();
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
    tabActive = false;
    if (previewIframe) {
        previewOn = false;
        updatePreviewButton();
        unmountPreview();
    }
}
