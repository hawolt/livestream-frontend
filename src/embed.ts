import { captchaQuery, getCaptchaToken } from "./captcha.ts";
const stageEl = document.getElementById("embed-stage") as HTMLElement;
const video = document.getElementById("embed-video") as HTMLVideoElement;
const posterEl = document.getElementById("embed-poster") as HTMLElement;
const unmuteBtn = document.getElementById("embed-unmute") as HTMLButtonElement;

const START_BEHIND_S = 0.8;
const SEEK_GAP_S = 6;
const PRUNE_KEEP_S = 30;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;
const RETRY_MULT = 2;
const HLS_BEACON_INTERVAL_MS = 10000;
const HOST_ID_KEY = "live_hid";

let username = "";
let mediaBase = "";
let transportKind: "ws" | "hls" | "none" = "none";

function mediaWsUrl(path: string): string {
    if (mediaBase) return mediaBase.replace(/^http/, "ws") + path;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
}

let gen = 0;
let terminal = false;
let offline = true;

let ws: WebSocket | null = null;
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;
let appendQueue: ArrayBuffer[] = [];
let objectUrl: string | null = null;
let startedPlayback = false;
let chaseTimer: number | null = null;
let hlsBeaconTimer: number | null = null;
let retryTimer: number | null = null;
let retryDelay = RETRY_MIN_MS;
let viewerId = "";
let hlsVideoCleanup: (() => void) | null = null;

function nextGen(): number {
    gen += 1;
    return gen;
}

function isCurrent(g: number): boolean {
    return g === gen && !terminal;
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

function setPoster(label: string | null): void {
    if (label === null) {
        posterEl.classList.add("hidden");
        posterEl.textContent = "";
        return;
    }
    posterEl.textContent = label;
    posterEl.classList.remove("hidden");
}

function showUnmute(show: boolean): void {
    unmuteBtn.classList.toggle("hidden", !show);
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
            resetRetryBackoff();
            video.currentTime = edge - START_BEHIND_S;
            void video.play().catch(() => {});
            setPlaying();
            return;
        }
        const gap = edge - video.currentTime;
        if (gap > SEEK_GAP_S) {
            video.currentTime = edge - START_BEHIND_S;
        }
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
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            appendQueue.unshift(chunk);
            const b = video.buffered;
            if (b.length && sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.remove(0, Math.max(b.start(0) + 1, video.currentTime - 5));
                } catch {}
            }
        } else {
            restartAfterFailure(g);
        }
    }
}

function stopHLSBeacon(): void {
    if (hlsBeaconTimer !== null) {
        window.clearInterval(hlsBeaconTimer);
        hlsBeaconTimer = null;
    }
}

function fullTeardown(): void {
    hlsVideoCleanup?.();
    hlsVideoCleanup = null;
    stopChase();
    stopHLSBeacon();
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
    video.pause();
    video.removeAttribute("src");
    video.load();
    showUnmute(false);
}

function setPlaying(): void {
    offline = false;
    setPoster(null);
    showUnmute(video.muted || video.volume === 0);
}

function goOffline(g: number): void {
    if (!offline) resetRetryBackoff();
    offline = true;
    fullTeardown();
    setPoster("Offline");
    scheduleRestart(nextRetryDelay(), g);
}

function restartAfterFailure(g: number): void {
    if (!isCurrent(g)) return;
    fullTeardown();
    setPoster(null);
    scheduleRestart(nextRetryDelay(), g);
}

function getViewerId(): string {
    if (viewerId) return viewerId;
    try {
        const stored = localStorage.getItem(HOST_ID_KEY);
        if (stored && /^[0-9a-f]{16}$/.test(stored)) {
            viewerId = stored;
            return viewerId;
        }
    } catch {}
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    viewerId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    try {
        localStorage.setItem(HOST_ID_KEY, viewerId);
    } catch {}
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

function attachMediaSource(g: number, codecs: string): void {
    const mime = `video/mp4; codecs="${codecs}"`;
    if (!MediaSource.isTypeSupported(mime)) {
        restartAfterFailure(g);
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
        } catch {
            restartAfterFailure(g);
            return;
        }
        sb.mode = "segments";
        sb.addEventListener("updateend", () => {
            if (!isCurrent(g)) return;
            pruneBuffer();
            pump(g);
        });
        sourceBuffer = sb;
        pump(g);
        startChase(g);
    };
    ms.addEventListener("sourceopen", onSourceOpen, { once: true });
}

function handleWSClose(g: number, ev: CloseEvent): void {
    if (ev.code === 4404 || ev.code === 1000) {
        goOffline(g);
    } else {
        restartAfterFailure(g);
    }
}

function startWSTransport(g: number): void {
    void captchaQuery().then((tq) => {
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
                const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
                if (codecs) attachMediaSource(g, codecs);
                return;
            }
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
    const src = `${mediaBase}/hls/${encodeURIComponent(username)}/live.m3u8`;

    const onPlaying = () => {
        if (!isCurrent(g)) return;
        resetRetryBackoff();
        setPlaying();
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        goOffline(g);
    };
    const onError = () => {
        if (!isCurrent(g)) return;
        restartAfterFailure(g);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    hlsVideoCleanup = () => {
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
    };

    void getCaptchaToken().then(() => {
        if (!isCurrent(g)) return;
        video.src = src;
        void video.play().catch(() => {});
        startHLSBeacon(g);
    });
}

function beginTransport(): void {
    if (terminal) return;
    clearRetryTimer();
    const g = nextGen();
    fullTeardown();
    if (transportKind === "ws") startWSTransport(g);
    else if (transportKind === "hls") startHLSTransport(g);
    else goOffline(g);
}

function enterTerminal(label: string): void {
    if (terminal) return;
    terminal = true;
    clearRetryTimer();
    nextGen();
    fullTeardown();
    setPoster(label);
}

function wireUnmute(): void {
    unmuteBtn.addEventListener("click", () => {
        video.muted = false;
        if (video.volume === 0) video.volume = 1;
        void video.play().catch(() => {});
        showUnmute(false);
    });
    stageEl.addEventListener("click", (ev) => {
        if (ev.target === unmuteBtn || unmuteBtn.contains(ev.target as Node)) return;
        if (video.muted && !offline) {
            video.muted = false;
            if (video.volume === 0) video.volume = 1;
            void video.play().catch(() => {});
            showUnmute(false);
        }
    });
}

function wirePageLifecycle(): void {
    window.addEventListener("pagehide", () => {
        if (terminal) return;
        clearRetryTimer();
        nextGen();
        fullTeardown();
    });
    window.addEventListener("pageshow", (ev) => {
        if (terminal) return;
        if ((ev as PageTransitionEvent).persisted) beginTransport();
    });
}

async function boot(): Promise<void> {
    wireUnmute();
    wirePageLifecycle();

    const seg = location.pathname.split("/").filter(Boolean)[1] ?? "";
    username = seg.toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
        enterTerminal("Invalid channel");
        return;
    }

    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(username)}`);
        if (res.status === 404) {
            enterTerminal("Channel not found");
            return;
        }
        if (res.ok) {
            const info: any = await res.json();
            if (info && typeof info.mediaBase === "string") {
                mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
        }
    } catch {}

    if ("MediaSource" in window) {
        transportKind = "ws";
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        transportKind = "hls";
    } else {
        enterTerminal("Playback not supported");
        return;
    }

    setPoster("Offline");
    beginTransport();
}

void boot();

export {};
