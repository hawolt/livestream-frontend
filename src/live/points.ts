import { API_BASE } from "../api.ts";
import { showNotice } from "../chat/notices.ts";
import { PointsBatcher } from "./points-batch.ts";

const NOTICE_TTL_MS = 15000;

let chipChannel = "";
let balanceKnown = false;
let ownChannel = false;
let batcher: PointsBatcher | null = null;

export function viewerOwnsChannel(info: { kind?: unknown; username?: unknown } | null, channel: string): boolean {
    return !!info && info.kind === "user"
        && typeof info.username === "string" && info.username.toLowerCase() === channel;
}

function renderBalance(balance: number): void {
    const wrap = document.getElementById("live-chat-points");
    const value = document.getElementById("live-chat-points-value");
    if (!wrap || !value) return;
    value.textContent = balance.toLocaleString();
    wrap.hidden = false;
}

function flushNotice(sum: number): void {
    showNotice("points", (root: HTMLDivElement) => {
        const text = document.createElement("span");
        text.textContent = `+${sum.toLocaleString()} channel points`;
        root.appendChild(text);
    }, { ttlMs: NOTICE_TTL_MS });
}

export function initPointsChip(channel: string): void {
    chipChannel = channel.toLowerCase();
    balanceKnown = false;
    ownChannel = false;
    batcher?.dispose();
    batcher = new PointsBatcher(flushNotice);
    const wrap = document.getElementById("live-chat-points");
    if (wrap) wrap.hidden = true;
    void seedBalance(chipChannel);
}

async function seedBalance(channel: string): Promise<void> {
    try {
        const sess = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (!sess.ok) return;
        const info = (await sess.json()) as { kind?: unknown; username?: unknown } | null;
        if (channel !== chipChannel) return;
        if (viewerOwnsChannel(info, channel)) {
            ownChannel = true;
            return;
        }
        if (!info || info.kind !== "user") return;
        const res = await fetch(`${API_BASE}/points/${encodeURIComponent(channel)}`, { credentials: "include" });
        if (!res.ok) return;
        const payload: unknown = await res.json();
        if (channel !== chipChannel || balanceKnown || ownChannel) return;
        const points = (payload as { points?: unknown } | null)?.points;
        if (typeof points === "number") renderBalance(points);
    } catch {}
}

export function onPointsFrame(channel: string, gained: number, balance: number): void {
    if (channel.toLowerCase() !== chipChannel || ownChannel) return;
    balanceKnown = true;
    renderBalance(balance);
    batcher?.add(gained);
}
