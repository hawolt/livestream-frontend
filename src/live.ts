import { reconnectChatAfterLogin, startChat } from "./live-chat";
import { API_BASE, type LiveChannelInfo } from "./api.ts";
import { initSiteNav, markActive } from "./nav.ts";
import { captchaQuery, getCaptchaToken, setCaptchaAnchor, warmCaptcha } from "./captcha.ts";
import { readLocalStorage, writeLocalStorage } from "./storage.ts";
import { streamLanguageLabel } from "./stream-languages.ts";

const page = document.getElementById("live-page") as HTMLElement;
const nameEl = document.getElementById("live-name") as HTMLElement;
const sepEl = document.getElementById("live-sep") as HTMLElement;
const badgeEl = document.getElementById("live-badge") as HTMLElement;
const posterEl = document.getElementById("live-poster") as HTMLElement;
const stageEl = document.getElementById("live-stage") as HTMLElement;
const video = document.getElementById("live-video") as HTMLVideoElement;
const titleBar = document.getElementById("live-info-bar") as HTMLElement;
const titleEl = document.getElementById("live-title-text") as HTMLElement;
const categoryEl = document.getElementById("live-category") as HTMLAnchorElement;
const categorySepEl = document.getElementById("live-category-sep") as HTMLElement;
const languageEl = document.getElementById("live-language") as HTMLElement;
const languageSepEl = document.getElementById("live-language-sep") as HTMLElement;
const viewersEl = document.getElementById("live-viewers") as HTMLElement;
const viewersCountEl = document.getElementById("live-viewers-count") as HTMLElement;
const viewersHeaderEl = document.getElementById("live-viewers-header") as HTMLElement;
const viewersHeaderCountEl = document.getElementById("live-viewers-header-count") as HTMLElement;
const uptimeEl = document.getElementById("live-uptime") as HTMLElement;
const followWrapEl = document.getElementById("live-follow") as HTMLElement;
const followBtnEl = document.getElementById("btn-follow") as HTMLButtonElement;
const followBellEl = document.getElementById("btn-follow-notify") as HTMLButtonElement;
const loginModalEl = document.getElementById("login-modal") as HTMLElement;
const loginModalBoxEl = loginModalEl.querySelector(".login-modal-box") as HTMLElement;
const loginModalCloseEl = document.getElementById("login-modal-close") as HTMLButtonElement;
const loginModalTitleEl = document.getElementById("login-modal-title") as HTMLElement;
const loginModalFormEl = document.getElementById("login-modal-form") as HTMLFormElement;
const loginModalUserEl = document.getElementById("login-modal-user") as HTMLInputElement;
const loginModalPassEl = document.getElementById("login-modal-pass") as HTMLInputElement;
const loginModalErrorEl = document.getElementById("login-modal-error") as HTMLElement;
const loginModalSubmitEl = document.getElementById("login-modal-submit") as HTMLButtonElement;
const loginModalSignupEl = document.getElementById("login-modal-signup") as HTMLAnchorElement;
const qualityEl = document.getElementById("live-quality") as HTMLElement;
const btnLayoutToggle = document.getElementById("btn-layout-toggle") as HTMLButtonElement;
const btnPlay = document.getElementById("btn-play") as HTMLButtonElement;
const btnMute = document.getElementById("btn-mute") as HTMLButtonElement;
const volInput = document.getElementById("vol") as HTMLInputElement;
const volpctEl = document.getElementById("live-volpct") as HTMLElement;
const btnFullscreen = document.getElementById("btn-fullscreen") as HTMLButtonElement;
const btnCinema = document.getElementById("btn-cinema") as HTMLButtonElement;
const seekBarEl = document.getElementById("live-seekbar") as HTMLElement;
const seekTrackEl = document.getElementById("live-seekbar-track") as HTMLElement;
const seekProgressEl = document.getElementById("live-seekbar-progress") as HTMLElement;
const seekThumbEl = document.getElementById("live-seekbar-thumb") as HTMLElement;
const behindReadoutEl = document.getElementById("live-behind") as HTMLElement;
const btnLiveChip = document.getElementById("btn-live-chip") as HTMLButtonElement;
const browseMiniOverlay = document.getElementById("browse-mini-overlay") as HTMLElement;
const browseMiniReturn = document.getElementById("browse-mini-return") as HTMLButtonElement;
const browseMiniUsername = document.getElementById("browse-mini-username") as HTMLElement;
const browseMiniClose = document.getElementById("browse-mini-close") as HTMLButtonElement;
const browseIframeEl = document.getElementById("browse-iframe") as HTMLIFrameElement;
const chatEl = document.getElementById("live-chat") as HTMLElement;
const chatMessagesEl = document.getElementById("live-chat-messages") as HTMLElement;
const chatInputEl = document.getElementById("live-chat-input") as HTMLInputElement;
const btnChatToggle = document.getElementById("btn-chat-toggle") as HTMLButtonElement;
const btnChatCollapse = document.getElementById("btn-chat-collapse") as HTMLButtonElement;
const btnChatFullscreen = document.getElementById("btn-chat-fullscreen") as HTMLButtonElement;
const btnChatSide = document.getElementById("btn-chat-side") as HTMLButtonElement;
const btnChatPopout = document.getElementById("btn-chat-popout") as HTMLButtonElement;
const CHAT_SIDE_KEY = "live-chat-side";

const START_BEHIND_S = 0.8;
const CHASE_GAP_S = 1.3;
const CHASE_RATE = 1.08;
const CHASE_STOP_S = 0.8;
const SEEK_GAP_S = 6;
const PRUNE_KEEP_S = 300;
const LIVE_EDGE_SNAP_S = 2;
const SEEK_BAR_MIN_SPAN_S = 10;
const QUOTA_TRIM_FLOOR_S = 5;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;
const RETRY_MULT = 2;
const WAITING_STALL_MS = 8000;
const HEALTH_STALE_MS = 15000;
const HEALTH_STUCK_MS = 20000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const FULLSCREEN_SETTLE_MS = 120;
const CHAT_COLLAPSE_KEY = "live-chat-collapsed";
const CHAT_MIN_PX = 300;
const CHAT_MAX_PX = 560;
const COMPACT_MAX_WIDTH_PX = 900;
const CHAT_FIT_MIN_VW = COMPACT_MAX_WIDTH_PX + 1;
const CHAT_FIT_HYSTERESIS_PX = 8;
const DEFAULT_ASPECT = 16 / 9;
const CONTROLS_HIDE_MS = 3000;
const LAYOUT_KEY = "live-layout";
const LAYOUT_VERTICAL_QUERY = `(max-width: ${COMPACT_MAX_WIDTH_PX}px) and (orientation: portrait)`;
const HLS_BEACON_INTERVAL_MS = 10000;
const HLS_HOST_ID_KEY = "live_hid";
const VOLUME_KEY = "live-volume";

let mediaBase = "";

function mediaWsUrl(path: string): string {
    if (mediaBase) return mediaBase.replace(/^http/, "ws") + path;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
}

let controlsHideTimer: number | null = null;

type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type VideoFs = HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
    webkitDisplayingFullscreen?: boolean;
};

const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const ICON_VOLUME = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
const ICON_VOLUME_LOW = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M15.5 8.5a5 5 0 010 7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16.2 10.2l3.6 3.6m0-3.6l-3.6 3.6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const ICON_FULLSCREEN = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FULLSCREEN_EXIT = '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CINEMA = '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/><rect x="7" y="9" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';

let username = "";
let chatPopout = false;

type PlayerState = "offline" | "connecting" | "buffering" | "playing" | "reconnecting";

let gen = 0;
let state: PlayerState = "offline";
let terminal = false;
let transportKind: "ws" | "hls" | "none" = "none";

let ws: WebSocket | null = null;
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;
let appendQueue: ArrayBuffer[] = [];
let objectUrl: string | null = null;
let startedPlayback = false;
let overflowReconnects = 0;
let chaseTimer: number | null = null;
let hlsBeaconTimer: number | null = null;
let retryTimer: number | null = null;
let retryDelay = RETRY_MIN_MS;
let waitingTimer: number | null = null;
let pageHideTornDown = false;
let startedOnce = false;

let behindLive = false;
let seekDragging = false;
let quotaKeepS = PRUNE_KEEP_S;
let quotaFailStreak = 0;

let cinemaMode = false;

let browseMode = false;
let browseMiniClosed = false;
let miniParked = false;

let genCleanup: Array<() => void> = [];

let lastMediaArrivalAt = 0;
let lastProgressAt = 0;
let lastObservedTime = -1;
let healthTimer: number | null = null;
let lastStateChangeAt = 0;
let viewerId = "";

function nextGen(): number {
    gen += 1;
    return gen;
}

function isCurrent(g: number): boolean {
    return g === gen && !terminal;
}

function track(cleanup: () => void): void {
    genCleanup.push(cleanup);
}

function runGenCleanup(): void {
    const fns = genCleanup;
    genCleanup = [];
    for (const fn of fns) {
        try {
            fn();
        } catch {}
    }
}

function clearRetryTimer(): void {
    if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
    }
}

function resetRetryBackoff(): void {
    retryDelay = RETRY_MIN_MS;
}

function nextRetryDelay(): number {
    const d = retryDelay;
    retryDelay = Math.min(retryDelay * RETRY_MULT, RETRY_MAX_MS);
    return d;
}

let lastMediaBaseRefresh = 0;

async function refreshMediaBase(): Promise<void> {
    const now = Date.now();
    if (now - lastMediaBaseRefresh < 30000) return;
    lastMediaBaseRefresh = now;
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(username)}`);
        if (!res.ok) return;
        const info = await res.json();
        if (info && typeof info.mediaBase === "string") {
            mediaBase = info.mediaBase.replace(/\/+$/, "");
        }
    } catch {}
}

function scheduleRestart(delayMs: number, g: number): void {
    clearRetryTimer();
    retryTimer = window.setTimeout(async () => {
        retryTimer = null;
        if (!isCurrent(g)) return;
        await refreshMediaBase();
        if (!isCurrent(g)) return;
        beginTransport();
    }, delayMs);
}

function clearWaitingTimer(): void {
    if (waitingTimer !== null) {
        window.clearTimeout(waitingTimer);
        waitingTimer = null;
    }
}

function setBadge(on: boolean): void {
    badgeEl.hidden = on;
}

function setPoster(label: string | null, isError = false, isLoading = false): void {
    if (label === null) {
        posterEl.classList.add("hidden");
        posterEl.classList.remove("loading");
        posterEl.textContent = "";
        posterEl.setAttribute("aria-busy", "false");
        stageEl.classList.remove("terminal");
        return;
    }
    posterEl.textContent = label;
    posterEl.classList.toggle("error", isError);
    posterEl.classList.toggle("loading", isLoading);
    posterEl.setAttribute("aria-busy", String(isLoading));
    posterEl.classList.remove("hidden");
}

function setTerminal(label: string, isError = true): void {
    setPoster(label, isError);
    stageEl.classList.add("terminal");
}

function enterTerminal(label: string): void {
    if (terminal) return;
    terminal = true;
    clearRetryTimer();
    stopHealthTimer();
    nextGen();
    fullTeardown();
    setTerminal(label, true);
}

function updateInfoBar(): void {}

function renderOdometer(el: HTMLElement, value: number): void {
    const chars = value.toLocaleString().split("");
    const pattern = chars.map((c) => (/\d/.test(c) ? "d" : c)).join("");
    const fresh = el.dataset.odoPattern !== pattern;
    if (fresh) {
        el.dataset.odoPattern = pattern;
        el.replaceChildren();
        for (const c of chars) {
            if (/\d/.test(c)) {
                const col = document.createElement("span");
                col.className = "odo-col";
                const strip = document.createElement("span");
                strip.className = "odo-strip no-anim";
                for (let d = 0; d <= 9; d++) {
                    const cell = document.createElement("span");
                    cell.textContent = String(d);
                    strip.appendChild(cell);
                }
                col.appendChild(strip);
                el.appendChild(col);
            } else {
                const sep = document.createElement("span");
                sep.className = "odo-sep";
                sep.textContent = c;
                el.appendChild(sep);
            }
        }
    }
    const cols = el.querySelectorAll<HTMLElement>(".odo-strip");
    const firstCell = cols[0]?.firstElementChild as HTMLElement | null;
    const cellPx = firstCell ? firstCell.getBoundingClientRect().height : 0;
    let i = 0;
    for (const c of chars) {
        if (!/\d/.test(c)) continue;
        const strip = cols[i++];
        if (!strip) continue;
        strip.style.transform = cellPx > 0
            ? `translateY(-${Number(c) * cellPx}px)`
            : `translateY(-${Number(c) * 1.25}em)`;
    }
    if (fresh) {
        el.getBoundingClientRect();
        requestAnimationFrame(() => {
            el.querySelectorAll<HTMLElement>(".odo-strip").forEach((strip) => strip.classList.remove("no-anim"));
        });
    }
}

function setAccessibleViewerCount(container: HTMLElement, count: HTMLElement, value: number | null): void {
    count.setAttribute("aria-hidden", "true");
    container.querySelector("svg")?.setAttribute("aria-hidden", "true");
    let accessible = container.querySelector<HTMLElement>(".viewer-count-accessible");
    if (!accessible) {
        accessible = document.createElement("span");
        accessible.className = "viewer-count-accessible";
        container.appendChild(accessible);
    }
    accessible.textContent = value === null
        ? ""
        : `${value.toLocaleString()} viewer${value === 1 ? "" : "s"}`;
}

function setViewers(n: number | null): void {
    if (typeof n === "number" && n >= 0) {
        renderOdometer(viewersCountEl, n);
        setAccessibleViewerCount(viewersEl, viewersCountEl, n);
        viewersEl.classList.remove("hidden");
        renderOdometer(viewersHeaderCountEl, n);
        setAccessibleViewerCount(viewersHeaderEl, viewersHeaderCountEl, n);
        viewersHeaderEl.classList.remove("hidden");
    } else {
        viewersCountEl.replaceChildren();
        delete viewersCountEl.dataset.odoPattern;
        setAccessibleViewerCount(viewersEl, viewersCountEl, null);
        viewersEl.classList.add("hidden");
        viewersHeaderCountEl.replaceChildren();
        delete viewersHeaderCountEl.dataset.odoPattern;
        setAccessibleViewerCount(viewersHeaderEl, viewersHeaderCountEl, null);
        viewersHeaderEl.classList.add("hidden");
    }
    updateInfoBar();
}

let streamStartMs = 0;
let streamFps = 0;
let streamW = 0;
let streamH = 0;
let uptimeTimer: number | null = null;

function setStreamStart(ms: number): void {
    streamStartMs = ms;
    tickUptime();
    if (uptimeTimer === null) uptimeTimer = window.setInterval(tickUptime, 1000);
}

function formatUptime(total: number): string {
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${d}:${hh}:${mm}:${ss}`;
}

function tickUptime(): void {
    if (streamStartMs <= 0) {
        uptimeEl.hidden = true;
        return;
    }
    uptimeEl.textContent = formatUptime(Math.max(0, Math.floor((Date.now() - streamStartMs) / 1000)));
    uptimeEl.hidden = false;
}

function updateQuality(): void {
    const w = video.videoWidth > 0 ? video.videoWidth : streamW;
    const h = video.videoHeight > 0 ? video.videoHeight : streamH;
    if (w > 0 && h > 0) {
        qualityEl.textContent = streamFps > 0 ? `${w}×${h} ${Math.round(streamFps)}fps` : `${w}×${h}`;
    } else {
        qualityEl.textContent = "";
    }
}

let fpsSampleFrames = 0;
let fpsSampleTime = 0;
let fpsTimer = 0;
function startFpsMeter(): void {
    if (fpsTimer) return;
    if (typeof video.getVideoPlaybackQuality !== "function") return;
    fpsTimer = window.setInterval(() => {
        if (video.paused || video.readyState < 2) return;
        const q = video.getVideoPlaybackQuality();
        const t = video.currentTime;
        const dt = t - fpsSampleTime;
        const df = q.totalVideoFrames - fpsSampleFrames;
        if (fpsSampleTime > 0 && dt >= 1.5 && dt <= 4 && df >= 0) {
            const fps = df / dt;
            if (fps > 1 && fps < 240) {
                streamFps = fps;
                updateQuality();
            }
        }
        fpsSampleFrames = q.totalVideoFrames;
        fpsSampleTime = t;
    }, 2000);
}

function resetStreamInfo(): void {
    streamStartMs = 0;
    streamFps = 0;
    streamW = 0;
    streamH = 0;
    fpsSampleFrames = 0;
    fpsSampleTime = 0;
    if (uptimeTimer !== null) {
        clearInterval(uptimeTimer);
        uptimeTimer = null;
    }
    uptimeEl.hidden = true;
    uptimeEl.textContent = "";
    qualityEl.textContent = "";
}

function bufferedEnd(): number {
    const b = video.buffered;
    return b.length ? b.end(b.length - 1) : 0;
}

function bufferedStart(): number {
    const b = video.buffered;
    return b.length ? b.start(b.length - 1) : 0;
}

function setState(next: PlayerState): void {
    if (state === next) return;
    state = next;
    lastStateChangeAt = Date.now();
    renderPlayerUI();
}

function renderPlayerUI(): void {
    if (terminal) return;
    switch (state) {
        case "offline":
            setBadge(false);
            setPoster("Offline", false);
            break;
        case "connecting":
            setBadge(false);
            setPoster("Connecting", false, true);
            break;
        case "buffering":
            setBadge(false);
            setPoster("Buffering", false, true);
            break;
        case "reconnecting":
            setBadge(false);
            setPoster("Reconnecting", false, true);
            break;
        case "playing":
            setBadge(true);
            setPoster(null);
            break;
    }
}

function stopChase(): void {
    if (chaseTimer !== null) {
        clearInterval(chaseTimer);
        chaseTimer = null;
    }
}

function startChase(g: number): void {
    if (chaseTimer !== null) return;
    startedPlayback = false;
    chaseTimer = window.setInterval(() => {
        if (!isCurrent(g)) {
            stopChase();
            return;
        }
        const b = video.buffered;
        if (!b.length) return;
        const edge = b.end(b.length - 1);
        if (!startedPlayback) {
            if (edge - b.start(b.length - 1) < START_BEHIND_S) return;
            startedPlayback = true;
            overflowReconnects = 0;
            resetRetryBackoff();
            video.currentTime = edge - START_BEHIND_S;
            void video.play().catch(() => {});
            setState("playing");
        }
        updateInfoBar();
        if (!behindLive) {
            const gap = edge - video.currentTime;
            if (gap > SEEK_GAP_S) {
                video.currentTime = edge - START_BEHIND_S;
                video.playbackRate = 1;
            } else if (gap > CHASE_GAP_S) {
                video.playbackRate = CHASE_RATE;
            } else if (gap < CHASE_STOP_S) {
                video.playbackRate = 1;
            }
        } else {
            const start = b.start(b.length - 1);
            const guard = start + 3;
            if (video.currentTime < guard) {
                video.currentTime = Math.min(edge, guard + 1);
            }
        }
        updateSeekBar();
    }, 500);
}

function pruneBuffer(): void {
    if (!sourceBuffer || sourceBuffer.updating) return;
    const b = video.buffered;
    if (!b.length) return;
    const cutoff = video.currentTime - PRUNE_KEEP_S;
    if (cutoff > b.start(0) + 5) {
        try {
            sourceBuffer.remove(0, cutoff);
        } catch {}
    }
}

function pump(g: number): void {
    if (!isCurrent(g)) return;
    if (!sourceBuffer || sourceBuffer.updating || !appendQueue.length) return;
    const chunk = appendQueue.shift()!;
    try {
        sourceBuffer.appendBuffer(chunk);
        quotaFailStreak = 0;
        quotaKeepS = PRUNE_KEEP_S;
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            appendQueue.unshift(chunk);
            const b = video.buffered;
            if (b.length && sourceBuffer && !sourceBuffer.updating) {
                quotaFailStreak++;
                if (quotaFailStreak > 1) {
                    quotaKeepS = Math.max(QUOTA_TRIM_FLOOR_S, quotaKeepS / 2);
                }
                const target = Math.max(b.start(0) + 1, video.currentTime - quotaKeepS);
                try {
                    sourceBuffer.remove(0, target);
                } catch {}
            }
        } else {
            console.warn("live: source buffer append failed, restarting player", e);
            restartAfterFailure(g);
        }
    }
}

function formatBehind(s: number): string {
    const total = Math.max(0, Math.round(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `-${h}:${mm}:${ss}` : `-${mm}:${ss}`;
}

function updateSeekBar(): void {
    if (transportKind !== "ws") {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    const b = video.buffered;
    const start = bufferedStart();
    const end = bufferedEnd();
    const span = end - start;
    if (!b.length || span < SEEK_BAR_MIN_SPAN_S) {
        seekBarEl.hidden = true;
        behindReadoutEl.hidden = true;
        btnLiveChip.hidden = true;
        return;
    }
    seekBarEl.hidden = false;
    btnLiveChip.hidden = false;
    const pos = Math.min(end, Math.max(start, video.currentTime));
    const pct = ((pos - start) / span) * 100;
    seekProgressEl.style.width = `${pct}%`;
    seekThumbEl.style.left = `${pct}%`;
    const behind = end - pos;
    if (behind > LIVE_EDGE_SNAP_S) {
        behindReadoutEl.hidden = false;
        behindReadoutEl.textContent = formatBehind(behind);
        btnLiveChip.textContent = "GO LIVE";
        btnLiveChip.classList.add("live-chip-behind");
        btnLiveChip.classList.remove("live-chip-live");
    } else {
        behindReadoutEl.hidden = true;
        btnLiveChip.textContent = "LIVE";
        btnLiveChip.classList.remove("live-chip-behind");
        btnLiveChip.classList.add("live-chip-live");
    }
}

function seekPosFromEvent(ev: PointerEvent): number {
    const rect = seekTrackEl.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) : 0;
    const start = bufferedStart();
    const end = bufferedEnd();
    return start + frac * (end - start);
}

function applySeek(pos: number): void {
    if (transportKind !== "ws" || !video.buffered.length) return;
    const start = bufferedStart();
    const end = bufferedEnd();
    const clamped = Math.min(end, Math.max(start, pos));
    video.currentTime = clamped;
    behindLive = end - clamped > LIVE_EDGE_SNAP_S;
    if (!behindLive) video.playbackRate = 1;
    updateSeekBar();
}

function goLive(): void {
    const edge = bufferedEnd();
    if (edge <= 0) return;
    video.currentTime = Math.max(0, edge - START_BEHIND_S);
    video.playbackRate = 1;
    behindLive = false;
    void video.play().catch(() => {});
    updateSeekBar();
}

function wireSeekBar(): void {
    const onDown = (ev: PointerEvent) => {
        if (transportKind !== "ws") return;
        seekDragging = true;
        try {
            seekTrackEl.setPointerCapture(ev.pointerId);
        } catch {}
        applySeek(seekPosFromEvent(ev));
    };
    const onMove = (ev: PointerEvent) => {
        if (!seekDragging) return;
        applySeek(seekPosFromEvent(ev));
    };
    const onUp = (ev: PointerEvent) => {
        if (!seekDragging) return;
        seekDragging = false;
        try {
            seekTrackEl.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    seekTrackEl.addEventListener("pointerdown", onDown);
    seekTrackEl.addEventListener("pointermove", onMove);
    seekTrackEl.addEventListener("pointerup", onUp);
    seekTrackEl.addEventListener("pointercancel", onUp);
    btnLiveChip.addEventListener("click", () => {
        if (btnLiveChip.classList.contains("live-chip-behind")) goLive();
    });
}

function stopHLSBeacon(): void {
    if (hlsBeaconTimer !== null) {
        window.clearInterval(hlsBeaconTimer);
        hlsBeaconTimer = null;
    }
}

function fullTeardown(): void {
    stopChase();
    stopHLSBeacon();
    clearWaitingTimer();
    if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
            ws.close();
        } catch {}
    }
    ws = null;
    if (sourceBuffer) {
        try {
            if (sourceBuffer.updating) sourceBuffer.abort();
        } catch {}
        if (mediaSource && mediaSource.readyState === "open") {
            try {
                mediaSource.removeSourceBuffer(sourceBuffer);
            } catch {}
        }
    }
    sourceBuffer = null;
    mediaSource = null;
    appendQueue = [];
    startedPlayback = false;
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
    runGenCleanup();
    video.pause();
    video.removeAttribute("src");
    video.load();
    setBadge(false);
    setViewers(null);
    behindLive = false;
    seekDragging = false;
    quotaKeepS = PRUNE_KEEP_S;
    quotaFailStreak = 0;
    seekBarEl.hidden = true;
    behindReadoutEl.hidden = true;
    btnLiveChip.hidden = true;
}

function goOffline(g: number): void {
    if (state !== "offline") resetRetryBackoff();
    resetStreamInfo();
    setState("offline");
    scheduleRestart(nextRetryDelay(), g);
}

function restartAfterFailure(g: number): void {
    if (!isCurrent(g)) return;
    fullTeardown();
    setState("reconnecting");
    scheduleRestart(nextRetryDelay(), g);
}

function healthRestart(reason: string): void {
    if (terminal) return;
    console.log("live: health check restart:", reason);
    clearRetryTimer();
    beginTransport();
}

function healthCheck(): void {
    if (terminal) return;
    const now = Date.now();
    if (state === "playing") {
        const mediaStale = transportKind === "ws" && now - lastMediaArrivalAt > HEALTH_STALE_MS;
        const progressStale = !video.paused && now - lastProgressAt > HEALTH_STALE_MS;
        if (mediaStale || progressStale) healthRestart("stale-playing");
        return;
    }
    const awaitingTransport = state === "connecting"
        || state === "buffering"
        || state === "reconnecting"
        || (state === "offline" && startedOnce);
    if (awaitingTransport && now - lastStateChangeAt > HEALTH_STUCK_MS) healthRestart(`stuck-${state}`);
}

function startHealthTimer(): void {
    if (healthTimer !== null) return;
    healthTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") healthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthTimer(): void {
    if (healthTimer === null) return;
    window.clearInterval(healthTimer);
    healthTimer = null;
}

function attachVideoFailureListeners(g: number): void {
    const onError = () => {
        if (!isCurrent(g)) return;
        console.warn("live: video error, restarting");
        restartAfterFailure(g);
    };
    const onStalled = () => {
        if (!isCurrent(g)) return;
        console.warn("live: video stalled, restarting");
        restartAfterFailure(g);
    };
    const onWaiting = () => {
        if (!isCurrent(g)) return;
        clearWaitingTimer();
        waitingTimer = window.setTimeout(() => {
            waitingTimer = null;
            if (!isCurrent(g)) return;
            if (video.readyState < 3) restartAfterFailure(g);
        }, WAITING_STALL_MS);
    };
    const onRecovered = () => clearWaitingTimer();

    video.addEventListener("error", onError);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onRecovered);
    video.addEventListener("canplay", onRecovered);

    track(() => video.removeEventListener("error", onError));
    track(() => video.removeEventListener("stalled", onStalled));
    track(() => video.removeEventListener("waiting", onWaiting));
    track(() => video.removeEventListener("playing", onRecovered));
    track(() => video.removeEventListener("canplay", onRecovered));
    track(clearWaitingTimer);
}

function getViewerId(): string {
    if (viewerId) return viewerId;
    const stored = readLocalStorage(HLS_HOST_ID_KEY);
    if (stored && /^[0-9a-f]{16}$/.test(stored)) {
        viewerId = stored;
        return viewerId;
    }
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    viewerId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocalStorage(HLS_HOST_ID_KEY, viewerId);
    return viewerId;
}

function sendHLSBeat(): void {
    void captchaQuery().then((tq) => {
        const url = `${mediaBase}/hls/${encodeURIComponent(username)}/beat?id=${encodeURIComponent(getViewerId())}${tq}`;
        fetch(url, { method: "POST" }).catch(() => {});
    });
}

function startHLSBeacon(g: number): void {
    stopHLSBeacon();
    const beat = () => {
        if (!isCurrent(g)) {
            stopHLSBeacon();
            return;
        }
        sendHLSBeat();
    };
    beat();
    hlsBeaconTimer = window.setInterval(beat, HLS_BEACON_INTERVAL_MS);
}

function canUseNativeHLS(): boolean {
    return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function fallbackFromMSE(g: number): void {
    if (!isCurrent(g)) return;
    if (canUseNativeHLS()) {
        transportKind = "hls";
        beginTransport();
        return;
    }
    enterTerminal("Playback not supported");
}

function attachMediaSource(g: number, codecs: string): void {
    const mime = `video/mp4; codecs="${codecs}"`;
    if (!MediaSource.isTypeSupported(mime)) {
        console.warn("live: unsupported codecs", codecs);
        fallbackFromMSE(g);
        return;
    }
    const ms = new MediaSource();
    mediaSource = ms;
    const url = URL.createObjectURL(ms);
    objectUrl = url;
    video.src = url;
    const onSourceOpen = () => {
        if (!isCurrent(g) || mediaSource !== ms) return;
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
        let sb: SourceBuffer;
        try {
            sb = ms.addSourceBuffer(mime);
        } catch (e) {
            if (e instanceof DOMException && e.name === "NotSupportedError") {
                fallbackFromMSE(g);
                return;
            }
            console.warn("live: add source buffer failed, restarting player", e);
            restartAfterFailure(g);
            return;
        }
        sb.mode = "segments";
        const onUpdateEnd = () => {
            if (!isCurrent(g)) return;
            pruneBuffer();
            pump(g);
        };
        sb.addEventListener("updateend", onUpdateEnd);
        track(() => sb.removeEventListener("updateend", onUpdateEnd));
        sourceBuffer = sb;
        setState("buffering");
        pump(g);
        startChase(g);
    };
    ms.addEventListener("sourceopen", onSourceOpen, { once: true });
    track(() => ms.removeEventListener("sourceopen", onSourceOpen));
}

function handleWSClose(g: number, ev: CloseEvent): void {
    const wasPlaying = state === "playing";
    fullTeardown();
    if (ev.code === 4404) {
        console.log("live: channel offline, retrying");
        goOffline(g);
    } else if (ev.code === 4408) {
        overflowReconnects++;
        console.warn("live: viewer buffer overflow, reconnecting");
        setState("reconnecting");
        scheduleRestart(overflowReconnects <= 1 ? 100 : nextRetryDelay(), g);
    } else if (ev.code === 1000) {
        console.log(wasPlaying ? "live: stream ended, waiting for next" : "live: channel offline, retrying");
        goOffline(g);
    } else {
        console.warn("live: connection lost, retrying", ev.code);
        setState("reconnecting");
        scheduleRestart(nextRetryDelay(), g);
    }
}

function withCaptchaHint<T>(g: number, p: Promise<T>): Promise<T> {
    const t = window.setTimeout(() => {
        if (isCurrent(g) && !terminal) setPoster("Cloudflare is checking your browser", false, true);
    }, 300);
    return p.finally(() => window.clearTimeout(t));
}

function startWSTransport(g: number): void {
    attachVideoFailureListeners(g);
    void withCaptchaHint(g, captchaQuery()).then((tq) => {
    if (!isCurrent(g)) return;
    const path = `/ws/live?u=${encodeURIComponent(username)}&viewer_id=${encodeURIComponent(getViewerId())}${tq}`;
    const sock = new WebSocket(mediaWsUrl(path));
    ws = sock;
    sock.binaryType = "arraybuffer";

    sock.onmessage = (ev) => {
        if (!isCurrent(g)) return;
        if (typeof ev.data === "string") {
            let msg: any = {};
            try {
                msg = JSON.parse(ev.data);
            } catch {}
            if (typeof msg.viewers === "number") setViewers(msg.viewers);
            const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
            if (!codecs) return;
            if (typeof msg.started === "number" && msg.started > 0) setStreamStart(msg.started);
            if (typeof msg.fps === "number" && msg.fps > 0) streamFps = msg.fps;
            if (typeof msg.width === "number" && typeof msg.height === "number" && msg.width > 0) {
                streamW = msg.width;
                streamH = msg.height;
            }
            updateQuality();
            lastMediaArrivalAt = Date.now();
            attachMediaSource(g, codecs);
            return;
        }
        lastMediaArrivalAt = Date.now();
        appendQueue.push(ev.data as ArrayBuffer);
        pump(g);
    };

    sock.onclose = (ev) => {
        if (!isCurrent(g)) return;
        handleWSClose(g, ev);
    };

    sock.onerror = () => {
        if (!isCurrent(g)) return;
        try {
            sock.close();
        } catch {}
    };
    });
}

function startHLSTransport(g: number): void {
    attachVideoFailureListeners(g);
    const src = `${mediaBase}/hls/${encodeURIComponent(username)}/live.m3u8`;

    const onPlaying = () => {
        if (!isCurrent(g)) return;
        lastMediaArrivalAt = Date.now();
        resetRetryBackoff();
        setState("playing");
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        console.log("live: stream ended, waiting for next");
        goOffline(g);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    track(() => video.removeEventListener("playing", onPlaying));
    track(() => video.removeEventListener("ended", onEnded));

    setState("buffering");
    void withCaptchaHint(g, getCaptchaToken()).then(() => {
        if (!isCurrent(g)) return;
        video.src = src;
        void video.play().catch(() => {});
        startHLSBeacon(g);
    });
}

function beginTransport(): void {
    if (terminal) return;
    startHealthTimer();
    clearRetryTimer();
    const g = nextGen();
    fullTeardown();
    lastStateChangeAt = Date.now();
    lastMediaArrivalAt = Date.now();
    lastProgressAt = Date.now();
    lastObservedTime = video.currentTime;
    if (!startedOnce || (state !== "offline" && state !== "reconnecting")) {
        setState("connecting");
    }
    startedOnce = true;
    if (transportKind === "ws") startWSTransport(g);
    else if (transportKind === "hls") startHLSTransport(g);
}

function wirePageLifecycle(): void {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") healthCheck();
    });
    window.addEventListener("online", () => healthCheck());
    window.addEventListener("pagehide", () => {
        if (terminal) return;
        pageHideTornDown = true;
        clearRetryTimer();
        stopHealthTimer();
        nextGen();
        fullTeardown();
    });
    window.addEventListener("pageshow", (ev) => {
        if (terminal) return;
        const persisted = (ev as PageTransitionEvent).persisted;
        if (persisted || pageHideTornDown) {
            pageHideTornDown = false;
            beginTransport();
        } else {
            healthCheck();
        }
    });
}

function updatePlayIcon(): void {
    btnPlay.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
    const label = video.paused ? "Play" : "Pause";
    btnPlay.setAttribute("aria-label", label);
    btnPlay.title = label;
}

function isMutedState(): boolean {
    return video.muted || video.volume === 0;
}

function volumePercent(): number {
    return isMutedState() ? 0 : Math.round(video.volume * 100);
}

function updateVolumeUI(): void {
    const muted = isMutedState();
    const pct = volumePercent();
    volInput.value = String(muted ? 0 : video.volume);
    volInput.style.setProperty("--vol-fill", `${pct}%`);
    volpctEl.textContent = muted ? "Muted" : `${pct}%`;
    btnMute.innerHTML = muted ? ICON_MUTE : pct < 50 ? ICON_VOLUME_LOW : ICON_VOLUME;
    const label = muted ? "Unmute" : "Mute";
    btnMute.setAttribute("aria-label", label);
    btnMute.title = label;
}

function videoFs(): VideoFs {
    return video as VideoFs;
}

function isVideoFullscreen(): boolean {
    const d = document as FullscreenDoc;
    return document.fullscreenElement === stageEl || d.webkitFullscreenElement === stageEl || !!videoFs().webkitDisplayingFullscreen;
}

function enterFullscreen(): void {
    const el = stageEl as FullscreenEl;
    if (typeof el.requestFullscreen === "function") {
        void el.requestFullscreen().catch(enterNativeVideoFullscreen);
    } else if (typeof el.webkitRequestFullscreen === "function") {
        el.webkitRequestFullscreen();
    } else {
        enterNativeVideoFullscreen();
    }
}

function enterNativeVideoFullscreen(): void {
    const v = videoFs();
    if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen();
}

function exitFullscreen(): void {
    const d = document as FullscreenDoc;
    const v = videoFs();
    if (v.webkitDisplayingFullscreen && typeof v.webkitExitFullscreen === "function") v.webkitExitFullscreen();
    else if (typeof document.exitFullscreen === "function") void document.exitFullscreen().catch(() => {});
    else if (typeof d.webkitExitFullscreen === "function") d.webkitExitFullscreen();
}

function updateFullscreenIcon(): void {
    const full = isVideoFullscreen();
    btnFullscreen.innerHTML = full ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN;
    const label = full ? "Exit fullscreen" : "Fullscreen";
    btnFullscreen.setAttribute("aria-label", label);
    btnFullscreen.title = label;
}

function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iP(hone|od|ad)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

function volumeIsSettable(): boolean {
    const prev = video.volume;
    const probe = prev > 0.5 ? 0.25 : 0.75;
    video.volume = probe;
    const settable = Math.abs(video.volume - probe) < 0.01;
    video.volume = prev;
    return settable;
}

type LiveLayoutMode = "auto" | "horizontal" | "vertical";

const layoutQuery = window.matchMedia(LAYOUT_VERTICAL_QUERY);

let preFsLayout: "horizontal" | "vertical" | null = null;
let settleRaf1: number | null = null;
let settleRaf2: number | null = null;
let settleTimer: number | null = null;

function isPopoutMode(): boolean {
    return document.body.classList.contains("chat-popout");
}

function getLayoutMode(): LiveLayoutMode {
    const stored = readLocalStorage(LAYOUT_KEY);
    return stored === "horizontal" || stored === "vertical" ? stored : "auto";
}

function layoutLabel(mode: LiveLayoutMode): string {
    return `Layout: ${mode}`;
}

function currentEffectiveLayout(): "horizontal" | "vertical" {
    return page.classList.contains("is-vertical") ? "vertical" : "horizontal";
}

function syncLayout(): void {
    if (isPopoutMode()) return;
    const mode = getLayoutMode();
    const effective = mode === "auto" ? (layoutQuery.matches ? "vertical" : "horizontal") : mode;
    const isVertical = effective === "vertical";
    page.classList.toggle("is-vertical", isVertical);
    document.body.classList.toggle("is-vertical", isVertical);
    if (isVertical) chatEl.classList.remove("collapsed");
    const label = layoutLabel(mode);
    btnLayoutToggle.title = label;
    btnLayoutToggle.setAttribute("aria-label", label);
    fitChat();
    updateCinemaButtonVisibility();
}

function cancelFullscreenSettle(): void {
    if (settleRaf1 !== null) {
        cancelAnimationFrame(settleRaf1);
        settleRaf1 = null;
    }
    if (settleRaf2 !== null) {
        cancelAnimationFrame(settleRaf2);
        settleRaf2 = null;
    }
    if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
    }
}

function scheduleFullscreenSettle(): void {
    cancelFullscreenSettle();
    settleRaf1 = requestAnimationFrame(() => {
        settleRaf1 = null;
        settleRaf2 = requestAnimationFrame(() => {
            settleRaf2 = null;
            settleTimer = window.setTimeout(() => {
                settleTimer = null;
                syncLayout();
                healthCheck();
            }, FULLSCREEN_SETTLE_MS);
        });
    });
}

function cycleLayout(): void {
    const order: LiveLayoutMode[] = ["auto", "horizontal", "vertical"];
    const next = order[(order.indexOf(getLayoutMode()) + 1) % order.length];
    writeLocalStorage(LAYOUT_KEY, next);
    syncLayout();
}

function updateCinemaButtonVisibility(): void {
    const unavailable = isPopoutMode() || currentEffectiveLayout() === "vertical";
    btnCinema.hidden = unavailable;
    if (unavailable && cinemaMode) exitCinemaMode();
}

function enterCinemaMode(): void {
    if (cinemaMode || isPopoutMode() || currentEffectiveLayout() === "vertical") return;
    if (chatFsActive) exitChatFullscreen();
    cinemaMode = true;
    document.body.classList.add("cinema-mode");
    btnCinema.classList.add("active");
    btnCinema.setAttribute("aria-label", "Exit cinema mode");
    btnCinema.title = "Exit cinema mode";
    scheduleFullscreenSettle();
}

function exitCinemaMode(): void {
    if (!cinemaMode) return;
    cinemaMode = false;
    document.body.classList.remove("cinema-mode");
    btnCinema.classList.remove("active");
    btnCinema.setAttribute("aria-label", "Cinema mode");
    btnCinema.title = "Cinema mode";
    scheduleFullscreenSettle();
}

function toggleCinemaMode(): void {
    if (cinemaMode) exitCinemaMode();
    else enterCinemaMode();
}

const EXPLORE_TITLE = "Explore";

function canEnterBrowseMode(): boolean {
    return !terminal && state !== "offline" && !isPopoutMode();
}

function applyBrowseMode(on: boolean, opts: { push?: boolean } = {}): void {
    const push = opts.push !== false;
    if (on) {
        if (browseMode) return;
        if (cinemaMode) exitCinemaMode();
        browseMode = true;
        browseMiniClosed = false;
        if (!browseIframeEl.src) browseIframeEl.src = "/?framed=1";
        browseIframeEl.hidden = false;
        Object.assign(browseIframeEl.style, {
            display: "block",
            position: "fixed",
            top: "52px",
            left: "0",
            right: "0",
            bottom: "0",
            width: "100%",
            height: "calc(100dvh - 52px)",
            border: "0",
            zIndex: "30",
            background: "var(--bg)",
        });
        if (push) history.pushState({ liveBrowse: true }, "", "/");
        document.title = EXPLORE_TITLE;
        document.body.classList.add("browse-mode");
        document.body.classList.remove("browse-mini-closed");
        markActive("browse");
    } else {
        if (!browseMode) return;
        browseMode = false;
        browseMiniClosed = false;
        browseIframeEl.hidden = true;
        browseIframeEl.style.display = "none";
        document.body.classList.remove("browse-mode", "browse-mini-closed");
        markActive(null);
        document.title = username;
        if (push) history.pushState({ liveChannel: true }, "", `/${encodeURIComponent(username)}`);
        if (miniParked) {
            miniParked = false;
            resetRetryBackoff();
            goOffline(gen);
        }
    }
    scheduleFullscreenSettle();
}

function closeBrowseMini(): void {
    if (!browseMode || browseMiniClosed) return;
    browseMiniClosed = true;
    document.body.classList.add("browse-mini-closed");
    miniParked = true;
    clearRetryTimer();
    stopHealthTimer();
    nextGen();
    fullTeardown();
    resetStreamInfo();
    setState("offline");
}

function wireBrowseMode(): void {
    if (isPopoutMode()) return;
    const brand = document.querySelector<HTMLAnchorElement>(".site-brand");
    const browseLink = document.querySelector<HTMLAnchorElement>('[data-nav="browse"]');
    const onNavClick = (ev: MouseEvent) => {
        if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        if (isPopoutMode() || !canEnterBrowseMode()) return;
        ev.preventDefault();
        applyBrowseMode(true);
    };
    brand?.addEventListener("click", onNavClick);
    browseLink?.addEventListener("click", onNavClick);

    browseMiniReturn.addEventListener("click", () => applyBrowseMode(false));
    browseMiniClose.addEventListener("click", closeBrowseMini);

    window.addEventListener("popstate", (ev) => {
        if (isPopoutMode()) return;
        const st = ev.state as { liveBrowse?: boolean; liveChannel?: boolean } | null;
        const wantBrowse = st ? !!st.liveBrowse : location.pathname === "/";
        applyBrowseMode(wantBrowse, { push: false });
    });
}

function setChatCollapsed(collapsed: boolean): void {
    if (isPopoutMode()) {
        chatEl.classList.remove("collapsed");
        fitChat();
        return;
    }
    chatEl.classList.toggle("collapsed", collapsed);
    writeLocalStorage(CHAT_COLLAPSE_KEY, collapsed ? "1" : "0");
    fitChat();
}

function toggleChat(): void {
    setChatCollapsed(!chatEl.classList.contains("collapsed"));
}

function fitChat(): void {
    if (isPopoutMode() || page.classList.contains("is-vertical") || chatEl.classList.contains("collapsed") || window.innerWidth < CHAT_FIT_MIN_VW) {
        chatEl.style.width = "";
        return;
    }
    const stageH = stageEl.getBoundingClientRect().height;
    if (stageH <= 0) {
        chatEl.style.width = "";
        return;
    }
    const aspect = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : DEFAULT_ASPECT;
    const ideal = window.innerWidth - stageH * aspect;
    const want = Math.round(Math.min(CHAT_MAX_PX, Math.max(CHAT_MIN_PX, ideal)));
    const current = parseFloat(chatEl.style.width) || 0;
    if (Math.abs(current - want) < CHAT_FIT_HYSTERESIS_PX) return;
    chatEl.style.width = `${want}px`;
}

let chatFsActive = false;
let chatFsNative = false;
let chatFsSavedScroll = 0;
let chatFsHadFocus = false;

function chatFullscreenTarget(): FullscreenEl {
    return chatEl as FullscreenEl;
}

function isChatFullscreen(): boolean {
    const d = document as FullscreenDoc;
    return chatFsActive || document.fullscreenElement === chatEl || d.webkitFullscreenElement === chatEl;
}

function updateChatFullscreenButton(): void {
    const full = isChatFullscreen();
    btnChatFullscreen.innerHTML = full ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN;
    const label = full ? "Exit fullscreen chat" : "Fullscreen chat";
    btnChatFullscreen.setAttribute("aria-label", label);
    btnChatFullscreen.title = label;
}

function applyChatFullscreenLayout(on: boolean): void {
    chatEl.classList.toggle("chat-fullscreen", on);
    document.body.classList.toggle("chat-fullscreen-lock", on);
}

function restoreChatScrollAndFocus(): void {
    const scroll = chatFsSavedScroll;
    const focus = chatFsHadFocus;
    requestAnimationFrame(() => {
        chatMessagesEl.scrollTop = scroll;
        if (focus) chatInputEl.focus();
    });
}

function enterChatFullscreen(): void {
    if (isChatFullscreen()) return;
    chatFsSavedScroll = chatMessagesEl.scrollTop;
    chatFsHadFocus = document.activeElement === chatInputEl;
    applyChatFullscreenLayout(true);
    chatFsActive = true;
    const el = chatFullscreenTarget();
    if (typeof el.requestFullscreen === "function") {
        chatFsNative = true;
        void el.requestFullscreen().catch(() => {
            chatFsNative = false;
        });
    } else if (typeof el.webkitRequestFullscreen === "function") {
        chatFsNative = true;
        el.webkitRequestFullscreen();
    } else {
        chatFsNative = false;
    }
    updateChatFullscreenButton();
    restoreChatScrollAndFocus();
}

function exitChatFullscreen(): void {
    if (!isChatFullscreen()) return;
    const d = document as FullscreenDoc;
    if (chatFsNative) {
        if (document.fullscreenElement === chatEl && typeof document.exitFullscreen === "function") void document.exitFullscreen().catch(() => {});
        else if (d.webkitFullscreenElement === chatEl && typeof d.webkitExitFullscreen === "function") d.webkitExitFullscreen();
    }
    chatFsActive = false;
    chatFsNative = false;
    applyChatFullscreenLayout(false);
    updateChatFullscreenButton();
    restoreChatScrollAndFocus();
}

function toggleChatFullscreen(): void {
    if (isChatFullscreen()) exitChatFullscreen();
    else enterChatFullscreen();
}

function syncChatFullscreenFromDocument(): void {
    const d = document as FullscreenDoc;
    const nativeActive = document.fullscreenElement === chatEl || d.webkitFullscreenElement === chatEl;
    if (!nativeActive && chatFsActive && chatFsNative) {
        chatFsActive = false;
        chatFsNative = false;
        applyChatFullscreenLayout(false);
        restoreChatScrollAndFocus();
    }
}

function onFullscreenChange(): void {
    updateFullscreenIcon();
    const videoFull = isVideoFullscreen();
    if (videoFull) {
        if (preFsLayout === null) preFsLayout = currentEffectiveLayout();
    } else if (preFsLayout !== null) {
        preFsLayout = null;
        scheduleFullscreenSettle();
    }
    syncChatFullscreenFromDocument();
    updateChatFullscreenButton();
}

function wireControls(): void {
    if (isIOS() || !volumeIsSettable()) {
        volInput.hidden = true;
        volpctEl.hidden = true;
    }

    layoutQuery.addEventListener("change", syncLayout);
    window.addEventListener("resize", syncLayout);
    window.addEventListener("orientationchange", syncLayout);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncLayout);
    }
    if (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.addEventListener === "function") {
        screen.orientation.addEventListener("change", syncLayout);
    }
    video.addEventListener("loadedmetadata", fitChat);
    new ResizeObserver(fitChat).observe(stageEl);

    updatePlayIcon();
    updateVolumeUI();
    btnFullscreen.innerHTML = ICON_FULLSCREEN;
    btnFullscreen.setAttribute("aria-label", "Fullscreen");
    btnFullscreen.title = "Fullscreen";
    updateChatFullscreenButton();
    btnCinema.innerHTML = ICON_CINEMA;
    btnCinema.setAttribute("aria-label", "Cinema mode");
    btnCinema.title = "Cinema mode";
    wireSeekBar();

    btnPlay.addEventListener("click", () => {
        if (video.paused) {
            void video.play().catch(() => {});
        } else {
            video.pause();
        }
    });

    video.addEventListener("play", () => {
        updatePlayIcon();
        if (transportKind === "ws" && behindLive) return;
        const edge = bufferedEnd();
        if (edge > 0) {
            video.currentTime = Math.max(0, edge - START_BEHIND_S);
        }
    });
    video.addEventListener("pause", () => {
        updatePlayIcon();
    });
    video.addEventListener("resize", updateQuality);
    video.addEventListener("loadedmetadata", updateQuality);
    startFpsMeter();
    video.addEventListener("timeupdate", () => {
        if (Math.abs(video.currentTime - lastObservedTime) > 0.01) {
            lastObservedTime = video.currentTime;
            lastProgressAt = Date.now();
        }
    });

    btnMute.addEventListener("click", () => {
        if (isMutedState()) {
            video.muted = false;
            if (video.volume === 0) video.volume = 0.5;
            void video.play().catch(() => {});
        } else {
            video.muted = true;
        }
        updateVolumeUI();
    });

    volInput.addEventListener("input", () => {
        const v = parseFloat(volInput.value);
        video.volume = v;
        video.muted = v === 0;
        updateVolumeUI();
        writeLocalStorage(VOLUME_KEY, String(v));
    });

    btnFullscreen.addEventListener("click", () => {
        if (isVideoFullscreen()) exitFullscreen();
        else enterFullscreen();
    });
    btnCinema.addEventListener("click", toggleCinemaMode);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    video.addEventListener("webkitbeginfullscreen", onFullscreenChange);
    video.addEventListener("webkitendfullscreen", onFullscreenChange);

    stageEl.addEventListener("mouseenter", () => stageEl.classList.add("controls-visible"));
    stageEl.addEventListener("mouseleave", () => stageEl.classList.remove("controls-visible"));
    stageEl.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType === "mouse") return;
        stageEl.classList.add("controls-visible");
        if (controlsHideTimer !== null) window.clearTimeout(controlsHideTimer);
        controlsHideTimer = window.setTimeout(() => {
            stageEl.classList.remove("controls-visible");
            controlsHideTimer = null;
        }, CONTROLS_HIDE_MS);
        const target = ev.target as HTMLElement | null;
        if (video.muted && !(target && target.closest(".live-controls"))) {
            video.muted = false;
            void video.play().catch(() => {});
            updateVolumeUI();
        }
    });

    document.addEventListener("keydown", (ev) => {
        const target = ev.target as HTMLElement | null;
        const interactive = target?.closest(
            "a[href], button, input, select, textarea, [contenteditable]:not([contenteditable=false]), [role=button], [role=link], [role=slider], [role=textbox], [role=menuitem]",
        );
        if (ev.defaultPrevented || ev.repeat) return;
        if (ev.key === "Escape") {
            if (isChatFullscreen() && !chatFsNative) {
                ev.preventDefault();
                exitChatFullscreen();
            } else if (cinemaMode && !isChatFullscreen() && !isVideoFullscreen()) {
                ev.preventDefault();
                exitCinemaMode();
            }
            return;
        }
        if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || interactive) return;
        if (ev.key === " ") {
            ev.preventDefault();
            btnPlay.click();
        } else if (ev.key === "m" || ev.key === "M") {
            btnMute.click();
        } else if (ev.key === "f" || ev.key === "F") {
            btnFullscreen.click();
        }
    });

    btnLayoutToggle.addEventListener("click", cycleLayout);
    btnChatToggle.addEventListener("click", toggleChat);
    btnChatCollapse.addEventListener("click", toggleChat);
    btnChatFullscreen.addEventListener("click", toggleChatFullscreen);
    btnChatSide.addEventListener("click", () => {
        const left = !document.body.classList.contains("chat-left");
        document.body.classList.toggle("chat-left", left);
        writeLocalStorage(CHAT_SIDE_KEY, left ? "left" : "right");
    });
    btnChatPopout.addEventListener("click", () => {
        const url = `/${encodeURIComponent(username)}?chat=popout`;
        window.open(url, `chat_${username}`, "width=420,height=760,menubar=no,toolbar=no,location=no");
    });
    if (readLocalStorage(CHAT_SIDE_KEY) === "left") document.body.classList.add("chat-left");
    const storedChat = readLocalStorage(CHAT_COLLAPSE_KEY);
    setChatCollapsed(window.innerWidth <= COMPACT_MAX_WIDTH_PX ? false : storedChat === "1");

    const storedVol = readLocalStorage(VOLUME_KEY);
    if (storedVol !== null) {
        const v = parseFloat(storedVol);
        if (!Number.isNaN(v) && v >= 0 && v <= 1) {
            video.volume = v;
            updateVolumeUI();
        }
    }

    wireBrowseMode();
    wirePageLifecycle();
}

async function boot(): Promise<void> {
    chatPopout = new URLSearchParams(location.search).get("chat") === "popout";
    if (chatPopout) document.body.classList.add("chat-popout");

    page.hidden = false;
    wireControls();
    syncLayout();
    void initSiteNav(null, [viewersHeaderEl, btnLayoutToggle, btnChatToggle]);

    const seg = location.pathname.split("/").filter(Boolean)[0] ?? "";
    username = seg.toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
        nameEl.textContent = "No channel";
        enterTerminal("No channel");
        return;
    }
    nameEl.textContent = username;
    document.title = username;
    browseMiniUsername.textContent = username;
    setCaptchaAnchor(chatEl);
    warmCaptcha();

    let title = "";
    let category = "";
    let categoryId: number | null = null;
    let language = "und";
    let emoteTwitchId = "";
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(username)}`);
        if (res.status === 404) {
            nameEl.textContent = "No channel";
            enterTerminal("No channel");
            return;
        }
        if (res.ok) {
            const info = await res.json() as Partial<LiveChannelInfo>;
            if (typeof info.title === "string") {
                title = info.title;
            }
            if (typeof info.category === "string" && info.category) {
                category = info.category;
            }
            if (typeof info.categoryId === "number") {
                categoryId = info.categoryId;
            }
            if (typeof info.language === "string") {
                language = info.language;
            }
            if (typeof info.mediaBase === "string") {
                mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
            if (typeof info.emoteTwitchId === "string") {
                emoteTwitchId = info.emoteTwitchId;
            }
        }
    } catch {}
    nameEl.textContent = username;
    document.title = username;
    titleEl.textContent = title;
    const hasCategory = !!category;
    const languageLabel = streamLanguageLabel(language);
    const hasLanguage = languageLabel !== null;
    sepEl.classList.toggle("hidden", !title && !hasCategory && !hasLanguage);
    categoryEl.textContent = category;
    if (categoryId !== null) categoryEl.href = `/?category=${categoryId}`;
    else categoryEl.removeAttribute("href");
    categoryEl.classList.toggle("hidden", !hasCategory);
    categorySepEl.classList.toggle("hidden", !title || !hasCategory);
    languageEl.textContent = languageLabel ?? "";
    languageEl.classList.toggle("hidden", !hasLanguage);
    languageSepEl.classList.toggle("hidden", !hasLanguage || (!title && !hasCategory));
    languageEl.title = languageLabel ? `Stream language: ${languageLabel}` : "";

    wireLoginModal();
    startChat(username, emoteTwitchId, () => openLoginModal("chat"));

    if (chatPopout) {
        document.title = `${username} - chat`;
        return;
    }

    void initFollow();

    if (typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function") {
        titleBar.classList.remove("hidden");
        transportKind = "ws";
    } else if (canUseNativeHLS()) {
        titleBar.classList.remove("hidden");
        transportKind = "hls";
    } else {
        enterTerminal("Playback not supported");
        return;
    }
    beginTransport();
}

let followLoggedIn = false;
let followOwn = false;
let following = false;
let followNotify = false;
let followWired = false;
let followRefreshRevision = 0;

type LoginIntent = "follow" | "chat";
let loginIntent: LoginIntent = "follow";
let loginModalWired = false;
let loginRestoreFocus: HTMLElement | null = null;
let loginAbort: AbortController | null = null;

function openLoginModal(intent: LoginIntent): void {
    loginIntent = intent;
    loginModalErrorEl.textContent = "";
    loginModalTitleEl.textContent = intent === "follow" ? `Log in to follow ${username}` : "Log in to chat";
    loginModalSignupEl.href = `/register?return=${encodeURIComponent(location.href)}`;
    if (loginModalEl.hidden) {
        loginRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    loginModalEl.hidden = false;
    loginModalUserEl.focus();
}

function closeLoginModal(): void {
    if (loginModalEl.hidden) return;
    loginAbort?.abort();
    loginAbort = null;
    setLoginBusy(false);
    loginModalEl.hidden = true;
    const restore = loginRestoreFocus;
    loginRestoreFocus = null;
    if (restore?.isConnected) restore.focus();
}

function setLoginBusy(busy: boolean): void {
    loginModalFormEl.setAttribute("aria-busy", String(busy));
    loginModalSubmitEl.disabled = busy;
    loginModalSubmitEl.textContent = busy ? "Logging in…" : "Log in";
}

function trapLoginFocus(event: KeyboardEvent): void {
    const focusable = Array.from(loginModalBoxEl.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ));
    if (!focusable.length) {
        event.preventDefault();
        loginModalBoxEl.focus();
        return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !loginModalBoxEl.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !loginModalBoxEl.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

function renderFollow(): void {
    followWrapEl.hidden = false;
    if (followOwn) {
        followBtnEl.hidden = true;
        followBellEl.hidden = true;
        return;
    }
    followBtnEl.hidden = false;
    followBtnEl.textContent = following ? "Following" : "Follow";
    followBtnEl.classList.toggle("following", following);
    followBellEl.hidden = !following;
    followBellEl.classList.toggle("on", followNotify);
    followBellEl.title = followNotify ? "Email notifications on" : "Email me when this channel goes live";
}

function wireFollow(): void {
    if (followWired) return;
    followWired = true;
    followBtnEl.addEventListener("click", async () => {
        if (!followLoggedIn) {
            openLoginModal("follow");
            return;
        }
        followBtnEl.disabled = true;
        try {
            const method = following ? "DELETE" : "POST";
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(username)}`, { method, credentials: "include" });
            if (r.ok) {
                const j = await r.json();
                following = !!j.following;
                if (following) followNotify = j.notify !== false;
            }
        } catch {}
        followBtnEl.disabled = false;
        renderFollow();
    });
    followBellEl.addEventListener("click", async () => {
        if (!following) return;
        const next = !followNotify;
        followBellEl.disabled = true;
        try {
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(username)}/notify`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            if (r.ok) {
                const j = await r.json();
                followNotify = !!j.notify;
            }
        } catch {}
        followBellEl.disabled = false;
        renderFollow();
    });
}

async function initFollow(): Promise<void> {
    const revision = ++followRefreshRevision;
    let me = "";
    let nextFollowing = false;
    let nextNotify = false;
    try {
        const s = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (s.ok) {
            const j = await s.json();
            me = String(j.username ?? "").toLowerCase();
        }
    } catch {}
    const nextLoggedIn = me !== "";
    const nextOwn = nextLoggedIn && me === username;
    if (nextLoggedIn && !nextOwn) {
        try {
            const st = await fetch(`${API_BASE}/follows/status?username=${encodeURIComponent(username)}`, { credentials: "include" });
            if (st.ok) {
                const j = await st.json();
                nextFollowing = !!j.following;
                nextNotify = !!j.notify;
            }
        } catch {}
    }
    if (revision !== followRefreshRevision) return;
    followLoggedIn = nextLoggedIn;
    followOwn = nextOwn;
    following = nextFollowing;
    followNotify = nextNotify;
    wireFollow();
    renderFollow();
}

function wireLoginModal(): void {
    if (loginModalWired) return;
    loginModalWired = true;
    loginModalCloseEl.addEventListener("click", () => closeLoginModal());
    loginModalEl.addEventListener("click", (e) => {
        if (e.target === loginModalEl) closeLoginModal();
    });
    document.addEventListener("keydown", (e) => {
        if (loginModalEl.hidden) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closeLoginModal();
        } else if (e.key === "Tab") {
            trapLoginFocus(e);
        }
    });
    loginModalFormEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = loginModalUserEl.value.trim();
        const pass = loginModalPassEl.value;
        if (!user || !pass) return;
        loginModalErrorEl.textContent = "";
        const intent = loginIntent;
        const controller = new AbortController();
        loginAbort?.abort();
        loginAbort = controller;
        setLoginBusy(true);
        try {
            const r = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user, password: pass }),
                signal: controller.signal,
            });
            const result = await r.json().catch(() => ({})) as {
                token?: string;
                kind?: string;
                error?: string;
                retryAfter?: number;
            };
            if (!r.ok || !result.token) {
                if (r.status === 429) {
                    const wait = result.retryAfter ? ` Try again in ${result.retryAfter} seconds.` : " Please try again later.";
                    loginModalErrorEl.textContent = `Too many login attempts.${wait}`;
                } else if (r.status === 401 || r.status === 403) {
                    loginModalErrorEl.textContent = "Invalid username or password.";
                } else {
                    loginModalErrorEl.textContent = result.error || "Login is unavailable. Please try again.";
                }
                return;
            }
            sessionStorage.setItem("dash_token", result.token);
            if (result.kind) sessionStorage.setItem("dash_kind", result.kind);
            else sessionStorage.removeItem("dash_kind");
            loginModalPassEl.value = "";
            loginAbort = null;
            closeLoginModal();
            reconnectChatAfterLogin();
            if (!chatPopout) await initFollow();
            if (intent === "follow" && followLoggedIn && !followOwn && !following) followBtnEl.click();
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                loginModalErrorEl.textContent = "Could not reach the login service. Check your connection and try again.";
            }
        } finally {
            if (loginAbort === controller) {
                loginAbort = null;
                setLoginBusy(false);
            }
        }
    });
}

void boot();

export {};
