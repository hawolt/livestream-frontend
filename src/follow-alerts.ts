import { scrubOverlayToken } from "./url-secrets.ts";

const stageEl = document.getElementById("alert-stage") as HTMLElement;

const RETRY_MS = 5000;
const AUTH_RETRY_MS = 30000;
const DEFAULT_DURATION_MS = 5000;
const EXIT_ANIMATION_NAME = "alert-out";
const ENTER_ANIMATION_NAME = "alert-in";
const ALERT_WATCHDOG_MARGIN_MS = 1000;

interface FollowEvent {
    username: string;
    at: number;
}

let token = "";
let demoMode = false;
let durationMs = DEFAULT_DURATION_MS;
let soundEnabled = true;
let soundVolume = 1;
let audio: HTMLAudioElement | null = null;
let soundUnlockPrompted = false;
let sock: WebSocket | null = null;
let retryTimer: number | null = null;
let showing = false;
const queue: FollowEvent[] = [];

function parseParams(): void {
    const qs = new URLSearchParams(location.search);
    const size = qs.get("size");
    if (size === "s" || size === "l") document.body.dataset.size = size;
    const durationSec = Number(qs.get("duration"));
    durationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : DEFAULT_DURATION_MS;
    demoMode = qs.get("demo") === "1";
    soundEnabled = qs.get("sound") !== "0";
    const rawVolume = qs.get("volume");
    if (rawVolume !== null) {
        const volume = Number(rawVolume);
        if (Number.isFinite(volume) && volume >= 0 && volume <= 100) soundVolume = volume / 100;
    }
    const scrubbed = scrubOverlayToken(location.href);
    token = scrubbed.token;
    if (scrubbed.replacement) history.replaceState(history.state, "", scrubbed.replacement);
}

function buildCard(username: string): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "alert-card enter";
    const name = document.createElement("div");
    name.className = "alert-name";
    name.textContent = username;
    const caption = document.createElement("div");
    caption.className = "alert-caption";
    caption.textContent = "just followed!";
    card.append(name, caption);
    return card;
}

function showNext(): void {
    const next = queue.shift();
    if (!next) {
        showing = false;
        return;
    }
    showing = true;
    const card = buildCard(next.username);
    stageEl.replaceChildren(card);
    playAlertSound();
    let watchdog: number | null = window.setTimeout(() => {
        watchdog = null;
        card.remove();
        showNext();
    }, durationMs + ALERT_WATCHDOG_MARGIN_MS);
    card.addEventListener("animationend", (ev) => {
        if (ev.animationName === ENTER_ANIMATION_NAME) {
            window.setTimeout(() => {
                card.classList.remove("enter");
                card.classList.add("exit");
            }, durationMs);
            return;
        }
        if (ev.animationName === EXIT_ANIMATION_NAME) {
            if (watchdog !== null) {
                window.clearTimeout(watchdog);
                watchdog = null;
            }
            card.remove();
            showNext();
        }
    });
}

function enqueueFollow(username: string): void {
    queue.push({ username, at: Math.floor(Date.now() / 1000) });
    if (!showing) showNext();
}

function scheduleRetry(delayMs: number): void {
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, delayMs);
}

function connect(): void {
    if (sock && (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/events`);
    sock = s;

    s.onopen = () => {
        if (sock !== s) return;
        s.send(JSON.stringify({ overlay: token }));
    };
    s.onmessage = (ev) => {
        if (sock !== s) return;
        if (typeof ev.data !== "string") return;
        let msg: unknown;
        try {
            msg = JSON.parse(ev.data);
        } catch {
            return;
        }
        if (!msg || typeof msg !== "object") return;
        const data = msg as Record<string, unknown>;
        if (data.type === "follow" && typeof data.username === "string") {
            enqueueFollow(data.username);
        }
    };
    s.onclose = (ev) => {
        if (sock !== s) return;
        sock = null;
        const delay = ev.code === 4401 ? AUTH_RETRY_MS : RETRY_MS;
        scheduleRetry(delay);
    };
    s.onerror = () => {
        if (sock === s) s.close();
    };
}

const DEMO_NAMES = [
    "emberfox", "northlight", "vex_rae", "comet99", "pixelloom",
    "quietstorm", "driftwood", "solace_", "kindling", "moonlit_dev",
];
const DEMO_INTERVAL_MS = 3000;

function startDemo(): void {
    let i = 0;
    const step = (): void => {
        enqueueFollow(DEMO_NAMES[i % DEMO_NAMES.length]!);
        i++;
    };
    step();
    window.setInterval(step, DEMO_INTERVAL_MS);
}

function playAlertSound(): void {
    if (!audio) return;
    try {
        audio.currentTime = 0;
    } catch {}
    void audio.play().catch((err: unknown) => {
        if ((err as DOMException)?.name === "NotAllowedError") promptSoundUnlock();
    });
}

function promptSoundUnlock(): void {
    if (soundUnlockPrompted) return;
    soundUnlockPrompted = true;
    const hint = document.createElement("div");
    hint.id = "sound-unlock";
    hint.textContent = "Click to enable alert sound";
    document.body.appendChild(hint);
    const unlock = (): void => {
        document.removeEventListener("pointerdown", unlock);
        hint.remove();
        if (!audio) return;
        void audio.play().then(() => {
            audio?.pause();
            try {
                if (audio) audio.currentTime = 0;
            } catch {}
        }).catch(() => {});
    };
    document.addEventListener("pointerdown", unlock);
}

function setupSound(username: string): void {
    if (!soundEnabled || soundVolume <= 0) return;
    const el = new Audio(`/api/live/alert-sound/${encodeURIComponent(username)}`);
    el.preload = "auto";
    el.volume = soundVolume;
    el.onerror = () => {
        audio = null;
    };
    audio = el;
}

function boot(): void {
    const m = location.pathname.match(/^\/alerts\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    parseParams();
    setupSound(m[1]!.toLowerCase());
    if (demoMode) {
        startDemo();
        return;
    }
    if (!token) return;
    connect();
}

boot();

export {};
