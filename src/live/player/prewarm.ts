import { stageEl } from "../dom.ts";
import { ctx } from "./context.ts";
import { START_BEHIND_S } from "../constants.ts";
import { captchaRequired, freshCaptchaQuery } from "../../captcha.ts";
import { ensureViewerId } from "../../player-shared/viewer-id.ts";
import { chooseTransportBase } from "../../player-shared/transport-fallback.ts";
import { mediaWsUrl } from "./ws.ts";
import { prewarmReady } from "./prewarm-ready.ts";
import { joinAction, type PrewarmPhase } from "./handover-decision.ts";
import type { AdoptedTransport } from "./adoption.ts";

export interface PrewarmChannel {
    target: string;
    displayUsername: string;
    title: string;
    category: string;
    categoryId: number | null;
    language: string;
    emoteTwitchId: string;
    mediaBase: string;
    wssBase: string;
    clipsDisabled: boolean;
}

export interface PrewarmResult {
    adoption: AdoptedTransport;
    channel: PrewarmChannel;
    videoEl: HTMLVideoElement;
}

interface PrewarmSession {
    target: string;
    phase: Exclude<PrewarmPhase, "idle">;
    request: AbortController;
    sock: WebSocket | null;
    mediaSource: MediaSource | null;
    sourceBuffer: SourceBuffer | null;
    objectUrl: string | null;
    queue: ArrayBuffer[];
    videoEl: HTMLVideoElement;
    channel: PrewarmChannel | null;
    started: number;
    fps: number;
    width: number;
    height: number;
    initAppended: boolean;
    fragmentsAppended: number;
    seeked: boolean;
    onUpdateEnd: (() => void) | null;
    onCanPlay: (() => void) | null;
    released: boolean;
}

let session: PrewarmSession | null = null;

export function prewarmPhase(): PrewarmPhase {
    return session ? session.phase : "idle";
}

export function startPrewarm(target: string): void {
    if (ctx.transportKind !== "ws") return;
    if (session && session.target === target && session.phase !== "dead") return;
    cancelPrewarm();
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.className = "live-video-prewarm";
    stageEl.appendChild(videoEl);
    const s: PrewarmSession = {
        target,
        phase: "pending",
        request: new AbortController(),
        sock: null,
        mediaSource: null,
        sourceBuffer: null,
        objectUrl: null,
        queue: [],
        videoEl,
        channel: null,
        started: 0,
        fps: 0,
        width: 0,
        height: 0,
        initAppended: false,
        fragmentsAppended: 0,
        seeked: false,
        onUpdateEnd: null,
        onCanPlay: null,
        released: false,
    };
    const onCanPlay = (): void => refreshReadiness(s);
    s.onCanPlay = onCanPlay;
    videoEl.addEventListener("canplay", onCanPlay);
    session = s;
    void openPrewarm(s);
}

export function cancelPrewarm(): void {
    const s = session;
    session = null;
    if (s) shutdown(s);
}

export function takeReadyPrewarm(target: string): PrewarmResult | null {
    const s = session;
    if (!s || !s.channel) return null;
    refreshReadiness(s);
    if (joinAction(s.phase, s.target, target) !== "swap") return null;
    const sock = s.sock;
    const mediaSource = s.mediaSource;
    const sourceBuffer = s.sourceBuffer;
    if (!sock || sock.readyState !== WebSocket.OPEN || !mediaSource || !sourceBuffer) return null;
    session = null;
    s.released = true;
    sock.onmessage = null;
    sock.onclose = null;
    sock.onerror = null;
    if (s.onUpdateEnd) sourceBuffer.removeEventListener("updateend", s.onUpdateEnd);
    if (s.onCanPlay) s.videoEl.removeEventListener("canplay", s.onCanPlay);
    return {
        adoption: {
            sock,
            mediaSource,
            sourceBuffer,
            queue: s.queue,
            started: s.started,
            fps: s.fps,
            width: s.width,
            height: s.height,
        },
        channel: s.channel,
        videoEl: s.videoEl,
    };
}

function sessionDead(s: PrewarmSession): boolean {
    return s.phase === "dead";
}

function die(s: PrewarmSession): void {
    if (sessionDead(s)) return;
    s.phase = "dead";
    shutdown(s);
}

function shutdown(s: PrewarmSession): void {
    if (s.released) return;
    s.released = true;
    s.request.abort();
    const sock = s.sock;
    s.sock = null;
    if (sock) {
        sock.onmessage = null;
        sock.onclose = null;
        sock.onerror = null;
        try {
            sock.close();
        } catch {}
    }
    if (s.sourceBuffer) {
        if (s.onUpdateEnd) s.sourceBuffer.removeEventListener("updateend", s.onUpdateEnd);
        try {
            if (s.sourceBuffer.updating) s.sourceBuffer.abort();
        } catch {}
    }
    s.sourceBuffer = null;
    s.mediaSource = null;
    if (s.objectUrl) {
        URL.revokeObjectURL(s.objectUrl);
        s.objectUrl = null;
    }
    s.queue = [];
    if (s.onCanPlay) s.videoEl.removeEventListener("canplay", s.onCanPlay);
    try {
        s.videoEl.pause();
    } catch {}
    s.videoEl.removeAttribute("src");
    s.videoEl.load();
    s.videoEl.remove();
}

async function openPrewarm(s: PrewarmSession): Promise<void> {
    let info: any = null;
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(s.target)}`, { signal: s.request.signal });
        if (!res.ok) {
            die(s);
            return;
        }
        info = await res.json();
    } catch {
        die(s);
        return;
    }
    if (session !== s || sessionDead(s)) return;
    if (!info || info.locked === true) {
        die(s);
        return;
    }
    const mediaBase = typeof info.mediaBase === "string" ? info.mediaBase.replace(/\/+$/, "") : "";
    const wssBase = typeof info.wssBase === "string" ? info.wssBase.replace(/\/+$/, "") : "";
    s.channel = {
        target: s.target,
        displayUsername: typeof info.username === "string" && info.username ? info.username : s.target,
        title: typeof info.title === "string" ? info.title : "",
        category: typeof info.category === "string" ? info.category : "",
        categoryId: typeof info.categoryId === "number" ? info.categoryId : null,
        language: typeof info.language === "string" ? info.language : "und",
        emoteTwitchId: typeof info.emoteTwitchId === "string" ? info.emoteTwitchId : "",
        mediaBase,
        wssBase,
        clipsDisabled: info.passwordRequired === true || info.ticketRequired === true,
    };
    let tq = "";
    let vid = "";
    try {
        [tq, vid] = await Promise.all([freshCaptchaQuery(), ensureViewerId(mediaBase, s.target)]);
    } catch {
        die(s);
        return;
    }
    if (session !== s || sessionDead(s)) return;
    if (captchaRequired() && !tq) {
        die(s);
        return;
    }
    const { base } = chooseTransportBase(wssBase, mediaBase);
    const path = `/ws/live?u=${encodeURIComponent(s.target)}&viewer_id=${encodeURIComponent(vid)}${tq}&prewarm=1`;
    let sock: WebSocket;
    try {
        sock = new WebSocket(mediaWsUrl(base, path));
    } catch {
        die(s);
        return;
    }
    s.sock = sock;
    sock.binaryType = "arraybuffer";
    sock.onmessage = (ev) => handlePrewarmMessage(s, ev);
    sock.onclose = () => die(s);
    sock.onerror = () => {
        try {
            sock.close();
        } catch {}
    };
}

function handlePrewarmMessage(s: PrewarmSession, ev: MessageEvent): void {
    if (sessionDead(s)) return;
    if (typeof ev.data === "string") {
        if (s.mediaSource) return;
        let msg: any = {};
        try {
            msg = JSON.parse(ev.data);
        } catch {}
        const codecs = typeof msg.codecs === "string" ? msg.codecs : "";
        if (!codecs) return;
        if (typeof msg.started === "number" && msg.started > 0) s.started = msg.started;
        if (typeof msg.fps === "number" && msg.fps > 0) s.fps = msg.fps;
        if (typeof msg.width === "number" && typeof msg.height === "number" && msg.width > 0) {
            s.width = msg.width;
            s.height = msg.height;
        }
        attachPrewarmMediaSource(s, codecs);
        return;
    }
    s.queue.push(ev.data as ArrayBuffer);
    prewarmPump(s);
}

function attachPrewarmMediaSource(s: PrewarmSession, codecs: string): void {
    const mime = `video/mp4; codecs="${codecs}"`;
    if (typeof MediaSource !== "function"
        || typeof MediaSource.isTypeSupported !== "function"
        || !MediaSource.isTypeSupported(mime)) {
        die(s);
        return;
    }
    const ms = new MediaSource();
    s.mediaSource = ms;
    s.objectUrl = URL.createObjectURL(ms);
    s.videoEl.src = s.objectUrl;
    const onOpen = (): void => {
        if (session !== s || sessionDead(s) || s.mediaSource !== ms) return;
        if (s.objectUrl) {
            URL.revokeObjectURL(s.objectUrl);
            s.objectUrl = null;
        }
        let sb: SourceBuffer;
        try {
            sb = ms.addSourceBuffer(mime);
        } catch {
            die(s);
            return;
        }
        sb.mode = "segments";
        const onUpdateEnd = (): void => {
            if (session !== s || sessionDead(s)) return;
            if (!s.initAppended) s.initAppended = true;
            else s.fragmentsAppended += 1;
            const b = s.videoEl.buffered;
            if (!s.seeked && b.length) {
                s.seeked = true;
                const start = b.start(0);
                const end = b.end(b.length - 1);
                s.videoEl.currentTime = Math.max(start, end - START_BEHIND_S);
            }
            void s.videoEl.play().catch(() => {});
            refreshReadiness(s);
            prewarmPump(s);
        };
        s.onUpdateEnd = onUpdateEnd;
        sb.addEventListener("updateend", onUpdateEnd);
        s.sourceBuffer = sb;
        prewarmPump(s);
    };
    ms.addEventListener("sourceopen", onOpen, { once: true });
}

function prewarmPump(s: PrewarmSession): void {
    const sb = s.sourceBuffer;
    if (!sb || sb.updating || !s.queue.length) return;
    const chunk = s.queue.shift()!;
    try {
        sb.appendBuffer(chunk);
    } catch {
        die(s);
    }
}

function refreshReadiness(s: PrewarmSession): void {
    if (s.phase !== "pending") return;
    const b = s.videoEl.buffered;
    const bufferedSeconds = b.length ? b.end(b.length - 1) - b.start(0) : 0;
    const ready = prewarmReady({
        initAppended: s.initAppended,
        fragmentsAppended: s.fragmentsAppended,
        bufferedSeconds,
        readyState: s.videoEl.readyState,
    });
    if (ready) s.phase = "ready";
}
