import type { ChatClipRef } from "./clip-link.ts";

export interface ClipCardMeta {
    channel: string;
    title: string;
    thumbnailUrl: string;
    durationMs: number;
}

export type ClipLoadResult =
    | { kind: "ready"; meta: ClipCardMeta }
    | { kind: "pending" }
    | { kind: "gone" };

type ScrollGuard = (mutate: () => void) => void;

const MAX_CACHED = 500;
const MAX_INFLIGHT = 8;
const PENDING_RETRY_MS = 20000;
const MAX_PENDING_RETRIES = 3;

const resolved = new Map<string, ClipCardMeta | null>();
const inflight = new Map<string, Promise<ClipLoadResult>>();

let scrollGuard: ScrollGuard = (mutate) => mutate();

export function setClipCardScrollGuard(guard: ScrollGuard): void {
    scrollGuard = guard;
}

function remember(code: string, meta: ClipCardMeta | null): void {
    resolved.set(code, meta);
    while (resolved.size > MAX_CACHED) {
        const oldest = resolved.keys().next();
        if (oldest.done) break;
        resolved.delete(oldest.value);
    }
}

function stringField(item: Record<string, unknown>, key: string): string {
    return typeof item[key] === "string" ? item[key] as string : "";
}

async function requestClip(code: string): Promise<ClipLoadResult> {
    const res = await fetch(`/api/live/clips/${encodeURIComponent(code)}`);
    if (res.status === 404) {
        remember(code, null);
        return { kind: "gone" };
    }
    if (!res.ok) return { kind: "pending" };
    const data = await res.json() as Record<string, unknown>;
    const status = stringField(data, "status");
    const thumbnailUrl = stringField(data, "thumbnailUrl");
    if (status === "ready" && thumbnailUrl) {
        const meta: ClipCardMeta = {
            channel: stringField(data, "channel"),
            title: stringField(data, "title"),
            thumbnailUrl,
            durationMs: typeof data["durationMs"] === "number" ? data["durationMs"] as number : 0,
        };
        remember(code, meta);
        return { kind: "ready", meta };
    }
    if (status === "ready" || status === "failed") {
        remember(code, null);
        return { kind: "gone" };
    }
    return { kind: "pending" };
}

function loadClip(code: string): Promise<ClipLoadResult> {
    const cached = resolved.get(code);
    if (cached) return Promise.resolve({ kind: "ready", meta: cached });
    if (cached === null) return Promise.resolve({ kind: "gone" });
    const pending = inflight.get(code);
    if (pending) return pending;
    if (inflight.size >= MAX_INFLIGHT) return Promise.resolve({ kind: "pending" });
    const request = requestClip(code)
        .catch((): ClipLoadResult => ({ kind: "pending" }))
        .finally(() => {
            inflight.delete(code);
        });
    inflight.set(code, request);
    return request;
}

export function formatClipDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
    const total = Math.round(durationMs / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function clipCardSubtitle(meta: ClipCardMeta): string {
    const duration = formatClipDuration(meta.durationMs);
    if (meta.channel && duration) return `${meta.channel} · ${duration}`;
    return meta.channel || duration;
}

function fillCard(anchor: HTMLAnchorElement, meta: ClipCardMeta): void {
    anchor.classList.remove("live-chat-link");
    anchor.classList.add("live-chat-clip");
    anchor.title = meta.title;
    anchor.replaceChildren();

    const thumb = document.createElement("img");
    thumb.className = "live-chat-clip-thumb";
    thumb.src = meta.thumbnailUrl;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";

    const info = document.createElement("span");
    info.className = "live-chat-clip-info";

    const title = document.createElement("span");
    title.className = "live-chat-clip-title";
    title.textContent = meta.title || "Clip";

    const sub = document.createElement("span");
    sub.className = "live-chat-clip-sub";
    sub.textContent = clipCardSubtitle(meta);

    info.append(title, sub);
    anchor.append(thumb, info);
}

function scheduleUpgrade(anchor: HTMLAnchorElement, ref: ChatClipRef, attempt: number): void {
    void loadClip(ref.code).then((result) => {
        if (!anchor.isConnected) return;
        if (result.kind === "ready") {
            scrollGuard(() => fillCard(anchor, result.meta));
            return;
        }
        if (result.kind === "pending" && attempt < MAX_PENDING_RETRIES) {
            setTimeout(() => {
                if (anchor.isConnected) scheduleUpgrade(anchor, ref, attempt + 1);
            }, PENDING_RETRY_MS);
        }
    });
}

export function upgradeToClipCard(anchor: HTMLAnchorElement, ref: ChatClipRef): void {
    const cached = resolved.get(ref.code);
    if (cached) {
        fillCard(anchor, cached);
        return;
    }
    if (cached === null) return;
    scheduleUpgrade(anchor, ref, 0);
}
