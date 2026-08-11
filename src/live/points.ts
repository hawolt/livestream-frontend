import { API_BASE } from "../api.ts";
import { showNotice } from "../chat/notices.ts";
import { PointsBatcher } from "./points-batch.ts";

const NOTICE_TTL_MS = 15000;

let chipChannel = "";
let balanceKnown = false;
let batcher: PointsBatcher | null = null;

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
    batcher?.dispose();
    batcher = new PointsBatcher(flushNotice);
    void seedBalance(chipChannel);
}

async function seedBalance(channel: string): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/points/${encodeURIComponent(channel)}`, { credentials: "include" });
        if (!res.ok) return;
        const payload: unknown = await res.json();
        if (channel !== chipChannel || balanceKnown) return;
        const points = (payload as { points?: unknown } | null)?.points;
        if (typeof points === "number") renderBalance(points);
    } catch {}
}

export function onPointsFrame(channel: string, gained: number, balance: number): void {
    if (channel.toLowerCase() !== chipChannel) return;
    balanceKnown = true;
    renderBalance(balance);
    batcher?.add(gained);
}
