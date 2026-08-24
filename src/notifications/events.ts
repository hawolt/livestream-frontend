import { sessionToken } from "./client.ts";

const RECONNECT_MS = 5000;
const UNAUTHORIZED_RECONNECT_MS = 60000;

export type SessionEventListener = (frame: Record<string, unknown>) => void;

const listeners = new Set<SessionEventListener>();

let socket: WebSocket | null = null;
let retryTimer: number | null = null;
let started = false;
let externalOwner = false;

export function onSessionEvent(listener: SessionEventListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function ingestSessionEvent(raw: unknown): void {
    let frame: unknown = raw;
    if (typeof raw === "string") {
        try {
            frame = JSON.parse(raw);
        } catch {
            return;
        }
    }
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;
    const record = frame as Record<string, unknown>;
    for (const listener of [...listeners]) listener(record);
}

export function adoptSessionEventsOwner(): void {
    externalOwner = true;
    closeSocket();
}

function clearRetryTimer(): void {
    if (retryTimer === null) return;
    window.clearTimeout(retryTimer);
    retryTimer = null;
}

function closeSocket(): void {
    clearRetryTimer();
    const previous = socket;
    socket = null;
    previous?.close();
}

function scheduleRetry(delayMs: number): void {
    if (!started || externalOwner || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, delayMs);
}

function connect(): void {
    if (!started || externalOwner) return;
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    const token = sessionToken();
    if (!token) {
        scheduleRetry(RECONNECT_MS);
        return;
    }
    clearRetryTimer();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/events`);
    socket = s;
    s.onopen = () => {
        if (socket !== s) return;
        s.send(JSON.stringify({ token: sessionToken() }));
    };
    s.onmessage = (event: MessageEvent) => {
        if (socket !== s || typeof event.data !== "string") return;
        ingestSessionEvent(event.data);
    };
    s.onclose = (event: CloseEvent) => {
        if (socket !== s) return;
        socket = null;
        scheduleRetry(event.code === 4401 ? UNAUTHORIZED_RECONNECT_MS : RECONNECT_MS);
    };
    s.onerror = () => {
        if (socket === s) s.close();
    };
}

export function startSessionEvents(): void {
    if (started) {
        connect();
        return;
    }
    started = true;
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) connect();
    });
    connect();
}

export function stopSessionEvents(): void {
    started = false;
    closeSocket();
}
