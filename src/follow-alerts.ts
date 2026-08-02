const stageEl = document.getElementById("alert-stage") as HTMLElement;

const RETRY_MS = 5000;
const AUTH_RETRY_MS = 30000;
const DEFAULT_DURATION_MS = 5000;
const EXIT_ANIMATION_NAME = "alert-out";
const ENTER_ANIMATION_NAME = "alert-in";

interface FollowEvent {
    username: string;
    at: number;
}

let token = "";
let demoMode = false;
let durationMs = DEFAULT_DURATION_MS;
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
    token = qs.get("token") ?? "";
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
    card.addEventListener("animationend", (ev) => {
        if (ev.animationName === ENTER_ANIMATION_NAME) {
            window.setTimeout(() => {
                card.classList.remove("enter");
                card.classList.add("exit");
            }, durationMs);
            return;
        }
        if (ev.animationName === EXIT_ANIMATION_NAME) {
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
        s.send(JSON.stringify({ overlay: token }));
    };
    s.onmessage = (ev) => {
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
    s.onerror = () => s.close();
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

function boot(): void {
    const m = location.pathname.match(/^\/alerts\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    parseParams();
    if (demoMode) {
        startDemo();
        return;
    }
    if (!token) return;
    connect();
}

boot();

export {};
