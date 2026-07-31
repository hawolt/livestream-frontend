import { uptimeEl, video, viewersCountEl, viewersEl, viewersHeaderCountEl, viewersHeaderEl, qualityEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { formatUptime } from "./format.ts";
import { VIEWCOUNT_RETRY_MS } from "./constants.ts";

export function updateInfoBar(): void {}

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

export function setViewers(n: number | null): void {
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

let viewcountSock: WebSocket | null = null;
let viewcountRetryTimer: number | null = null;

function clearViewcountRetryTimer(): void {
    if (viewcountRetryTimer !== null) {
        window.clearTimeout(viewcountRetryTimer);
        viewcountRetryTimer = null;
    }
}

function scheduleViewcountRetry(): void {
    clearViewcountRetryTimer();
    viewcountRetryTimer = window.setTimeout(() => {
        viewcountRetryTimer = null;
        connectViewcount();
    }, VIEWCOUNT_RETRY_MS);
}

export function connectViewcount(): void {
    if (viewcountSock && (viewcountSock.readyState === WebSocket.CONNECTING || viewcountSock.readyState === WebSocket.OPEN)) return;
    clearViewcountRetryTimer();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/events`);
    viewcountSock = s;

    s.onopen = () => {
        if (viewcountSock !== s) return;
        s.send(JSON.stringify({ watch: ctx.username }));
    };

    s.onmessage = (ev) => {
        if (viewcountSock !== s || typeof ev.data !== "string") return;
        let msg: any = {};
        try {
            msg = JSON.parse(ev.data);
        } catch {
            return;
        }
        if (msg.type === "viewcount" && typeof msg.viewers === "number") {
            setViewers(msg.viewers > 0 ? msg.viewers : null);
        }
    };

    s.onclose = () => {
        if (viewcountSock !== s) return;
        viewcountSock = null;
        scheduleViewcountRetry();
    };

    s.onerror = () => s.close();
}

let streamStartMs = 0;
let streamFps = 0;
let streamW = 0;
let streamH = 0;
let uptimeTimer: number | null = null;

export function setStreamStart(ms: number): void {
    streamStartMs = ms;
    tickUptime();
    if (uptimeTimer === null) uptimeTimer = window.setInterval(tickUptime, 1000);
}

function tickUptime(): void {
    if (streamStartMs <= 0) {
        uptimeEl.hidden = true;
        return;
    }
    uptimeEl.textContent = formatUptime(Math.max(0, Math.floor((Date.now() - streamStartMs) / 1000)));
    uptimeEl.hidden = false;
}

export function updateQuality(): void {
    const w = video.videoWidth > 0 ? video.videoWidth : streamW;
    const h = video.videoHeight > 0 ? video.videoHeight : streamH;
    if (w > 0 && h > 0) {
        qualityEl.textContent = streamFps > 0 ? `${w}×${h} ${Math.round(streamFps)}fps` : `${w}×${h}`;
    } else {
        qualityEl.textContent = "";
    }
}

export function setStreamFps(fps: number): void {
    streamFps = fps;
}

export function setStreamDimensions(w: number, h: number): void {
    streamW = w;
    streamH = h;
}

let fpsSampleFrames = 0;
let fpsSampleTime = 0;
let fpsTimer = 0;
export function startFpsMeter(): void {
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

export function resetStreamInfo(): void {
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
