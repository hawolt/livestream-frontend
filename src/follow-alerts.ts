import { scrubOverlayToken } from "./url-secrets.ts";
import { DEFAULT_ALERT_STYLE, applyOverrides, cssVarsFor, parseAlertStyle, substituteTemplate, templateHasName, tokenizeTemplate, type AlertStyle, type OverlayOverrides } from "./alerts/style.ts";

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
let previewStyleRaw = "";
const DEFAULT_ALERT_SOUND_URL = "/static/sounds/default_alert.mp3";
let durationMs = DEFAULT_DURATION_MS;
let hasStoredStyle = false;
let effectiveStyle: AlertStyle = DEFAULT_ALERT_STYLE;
const overrides: OverlayOverrides = {};
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
    if (size === "s") overrides.fontSizePx = 16;
    if (size === "l") overrides.fontSizePx = 30;
    const durationSec = Number(qs.get("duration"));
    if (Number.isFinite(durationSec) && durationSec > 0) overrides.durationMs = durationSec * 1000;
    durationMs = overrides.durationMs ?? DEFAULT_DURATION_MS;
    demoMode = qs.get("demo") === "1";
    previewStyleRaw = demoMode ? (qs.get("style") ?? "") : "";
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

function applyStyle(style: AlertStyle): void {
    effectiveStyle = style;
    durationMs = style.durationMs;
    const vars = cssVarsFor(style);
    for (const key of Object.keys(vars)) {
        stageEl.style.setProperty(key, vars[key]!);
    }
    stageEl.dataset.preset = style.preset;
    stageEl.dataset.animation = style.animation;
}

async function loadStyle(username: string): Promise<void> {
    let style = DEFAULT_ALERT_STYLE;
    if (previewStyleRaw) {
        try {
            style = parseAlertStyle(JSON.parse(previewStyleRaw));
            hasStoredStyle = true;
            applyStyle(applyOverrides(style, overrides));
            return;
        } catch {}
    }
    try {
        const res = await fetch(`/api/live/alert-style/${encodeURIComponent(username)}`);
        if (res.ok) {
            style = parseAlertStyle(await res.json());
            hasStoredStyle = true;
        }
    } catch {}
    applyStyle(applyOverrides(style, overrides));
}

function captionText(ev: AlertEvent): string {
    if (hasStoredStyle) {
        const tpl = ev.kind === "raid" ? effectiveStyle.template.raid : effectiveStyle.template.follow;
        return substituteTemplate(tpl, ev.username, ev.viewers);
    }
    if (ev.kind === "raid") {
        return ev.viewers > 0
            ? `just raided with ${ev.viewers} viewer${ev.viewers === 1 ? "" : "s"}!`
            : "just raided!";
    }
    return "just followed!";
}

function currentTemplate(ev: AlertEvent): string {
    return ev.kind === "raid" ? effectiveStyle.template.raid : effectiveStyle.template.follow;
}

function buildCard(ev: AlertEvent): HTMLDivElement {
    const card = document.createElement("div");
    card.className = ev.kind === "raid" ? "alert-card alert-card-raid enter" : "alert-card enter";
    const template = currentTemplate(ev);
    if (hasStoredStyle && templateHasName(template)) {
        const body = document.createElement("div");
        body.className = "alert-caption alert-body";
        for (const token of tokenizeTemplate(template, ev.username, ev.viewers)) {
            if (token.kind === "break") {
                body.appendChild(document.createElement("br"));
            } else if (token.kind === "name") {
                const span = document.createElement("span");
                span.className = "alert-name-inline";
                span.textContent = token.value;
                body.appendChild(span);
            } else if (token.kind === "viewers") {
                const span = document.createElement("span");
                span.className = "alert-viewers-inline";
                span.textContent = token.value;
                body.appendChild(span);
            } else {
                body.appendChild(document.createTextNode(token.value));
            }
        }
        card.append(body);
        return card;
    }
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
    window.addEventListener("message", (ev: MessageEvent) => {
        if (ev.origin !== location.origin) return;
        const data = ev.data as { type?: string; kind?: string } | null;
        if (!data || data.type !== "preview-alert") return;
        const kind = data.kind === "raid" ? "raid" : "follow";
        enqueueAlert({ kind, username: "TEST_USER", viewers: kind === "raid" ? 42 : 0 });
    });
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
            if (el.src.endsWith(DEFAULT_ALERT_SOUND_URL)) {
                audioByKind.delete(kind);
                return;
            }
            el.src = DEFAULT_ALERT_SOUND_URL;
            el.load();
        };
        audioByKind.set(kind, el);
    }
}

function boot(): void {
    const m = location.pathname.match(/^\/alerts\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    parseParams();
    void loadStyle(m[1]!.toLowerCase());
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
