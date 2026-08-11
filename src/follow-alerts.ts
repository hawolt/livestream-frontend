import { scrubOverlayToken } from "./url-secrets.ts";

const stageEl = document.getElementById("alert-stage") as HTMLElement;

const RETRY_MS = 5000;
const AUTH_RETRY_MS = 30000;
const DEFAULT_DURATION_MS = 5000;
const EXIT_ANIMATION_NAME = "alert-out";
const ENTER_ANIMATION_NAME = "alert-in";
const ALERT_WATCHDOG_MARGIN_MS = 1000;

interface AlertEvent {
    kind: "follow" | "raid";
    username: string;
    viewers: number;
}

let token = "";
let demoMode = false;
let durationMs = DEFAULT_DURATION_MS;
let soundEnabled = true;
let soundVolume = 1;
const audioByKind = new Map<AlertEvent["kind"], HTMLAudioElement>();
let soundUnlockPrompted = false;
let sock: WebSocket | null = null;
let retryTimer: number | null = null;
let showing = false;
const queue: AlertEvent[] = [];

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

function captionText(ev: AlertEvent): string {
    if (ev.kind === "raid") {
        return ev.viewers > 0
            ? `just raided with ${ev.viewers} viewer${ev.viewers === 1 ? "" : "s"}!`
            : "just raided!";
    }
    return "just followed!";
}

function buildCard(ev: AlertEvent): HTMLDivElement {
    const card = document.createElement("div");
    card.className = ev.kind === "raid" ? "alert-card alert-card-raid enter" : "alert-card enter";
    const name = document.createElement("div");
    name.className = "alert-name";
    name.textContent = ev.username;
    const caption = document.createElement("div");
    caption.className = "alert-caption";
    caption.textContent = captionText(ev);
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
    const card = buildCard(next);
    stageEl.replaceChildren(card);
    playAlertSound(next.kind);
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

function enqueueAlert(ev: AlertEvent): void {
    queue.push(ev);
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
            enqueueAlert({ kind: "follow", username: data.username, viewers: 0 });
        } else if (data.type === "raid" && typeof data.from === "string") {
            const viewers = typeof data.viewers === "number" && Number.isFinite(data.viewers)
                ? Math.max(0, Math.floor(data.viewers))
                : 0;
            enqueueAlert({ kind: "raid", username: data.from, viewers });
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
        const username = DEMO_NAMES[i % DEMO_NAMES.length]!;
        if (i % 5 === 4) enqueueAlert({ kind: "raid", username, viewers: 12 + (i % 40) });
        else enqueueAlert({ kind: "follow", username, viewers: 0 });
        i++;
    };
    step();
    window.setInterval(step, DEMO_INTERVAL_MS);
}

function playAlertSound(kind: AlertEvent["kind"]): void {
    const audio = audioByKind.get(kind);
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
        for (const audio of audioByKind.values()) {
            void audio.play().then(() => {
                audio.pause();
                try {
                    audio.currentTime = 0;
                } catch {}
            }).catch(() => {});
        }
    };
    document.addEventListener("pointerdown", unlock);
}

const SOUND_KINDS: AlertEvent["kind"][] = ["follow", "raid"];

function setupSounds(username: string): void {
    if (!soundEnabled || soundVolume <= 0) return;
    for (const kind of SOUND_KINDS) {
        const el = new Audio(`/api/live/alert-sound/${encodeURIComponent(username)}/${kind}`);
        el.preload = "auto";
        el.volume = soundVolume;
        el.onerror = () => {
            audioByKind.delete(kind);
        };
        audioByKind.set(kind, el);
    }
}

function boot(): void {
    const m = location.pathname.match(/^\/alerts\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    parseParams();
    setupSounds(m[1]!.toLowerCase());
    if (demoMode) {
        startDemo();
        return;
    }
    if (!token) return;
    connect();
}

boot();

export {};
