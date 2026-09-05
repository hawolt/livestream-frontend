const RETRY_MS = 5000;

const titleEl = document.getElementById("info-title") as HTMLElement;
const categoryEl = document.getElementById("info-category") as HTMLElement;
const viewersEl = document.getElementById("info-viewers") as HTMLElement;
const viewersWrap = document.getElementById("info-viewers-wrap") as HTMLElement;

let channel = "";
let sock: WebSocket | null = null;
let retryTimer: number | null = null;

function parseParams(): void {
    const path = location.pathname.split("/").filter(Boolean);
    channel = (path[path.length - 1] ?? "").toLowerCase();
    const qs = new URLSearchParams(location.search);
    if (qs.get("bg") === "0") document.body.dataset["bg"] = "0";
    if (qs.get("viewers") === "0") document.body.dataset["noviewers"] = "1";
}

function setTitle(title: string): void {
    titleEl.textContent = title || "";
    titleEl.style.display = title ? "" : "none";
}

function setCategory(category: string | null): void {
    categoryEl.textContent = category || "";
    categoryEl.style.display = category ? "" : "none";
}

function setViewers(viewers: number | null, live: boolean | null): void {
    if (document.body.dataset["noviewers"] === "1" || viewers === null || live === false) {
        viewersWrap.style.display = "none";
        return;
    }
    viewersWrap.style.display = "";
    viewersEl.textContent = String(viewers);
}

async function loadInitial(): Promise<void> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(channel)}`);
        if (!res.ok) return;
        const body = await res.json() as { title?: string; category?: string | null; live?: boolean };
        setTitle(typeof body.title === "string" ? body.title : "");
        setCategory(typeof body.category === "string" ? body.category : null);
        if (body.live === false) setViewers(null, false);
    } catch {}
}

function scheduleRetry(): void {
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, RETRY_MS);
}

function connect(): void {
    if (!channel) return;
    if (sock && (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/events`);
    sock = s;
    s.onopen = () => {
        if (sock !== s) return;
        s.send(JSON.stringify({ watch: channel }));
    };
    s.onmessage = (ev) => {
        if (sock !== s || typeof ev.data !== "string") return;
        let msg: unknown;
        try {
            msg = JSON.parse(ev.data);
        } catch {
            return;
        }
        if (!msg || typeof msg !== "object") return;
        const data = msg as Record<string, unknown>;
        if (data.type === "stream-info") {
            if (typeof data.title === "string") setTitle(data.title);
            setCategory(typeof data.category === "string" ? data.category : null);
        } else if (data.type === "viewcount") {
            const viewers = typeof data.viewers === "number" ? data.viewers : null;
            const live = typeof data.live === "boolean" ? data.live : true;
            setViewers(viewers, live);
        }
    };
    s.onclose = () => {
        if (sock !== s) return;
        sock = null;
        scheduleRetry();
    };
    s.onerror = () => s.close();
}

parseParams();
void loadInitial();
connect();
