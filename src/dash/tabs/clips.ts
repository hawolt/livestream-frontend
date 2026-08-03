import type { Clip } from "../../api.ts";
import { copyText } from "../../clipboard.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch, getMe } from "../session.ts";

let ownClipsCache: Clip[] = [];
let channelClipsCache: Clip[] = [];

function fmtDuration(ms: number | null): string {
    if (!ms || ms <= 0) return "-";
    const totalSeconds = Math.round(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function statusChipHtml(status: string): string {
    if (status === "processing") {
        return `<span class="badge" style="background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.3)">Processing</span>`;
    }
    if (status === "failed") {
        return `<span class="badge" style="background:rgba(248,113,113,.12);color:var(--red);border:1px solid rgba(248,113,113,.3)">Failed</span>`;
    }
    return `<span style="color:var(--muted);font-size:12px">Ready</span>`;
}

function thumbnailHtml(clip: Clip): string {
    if (clip.thumbnailUrl) {
        return `<img src="${esc(clip.thumbnailUrl)}" alt="" style="width:64px;height:36px;object-fit:cover;border-radius:4px;background:#000;flex-shrink:0" />`;
    }
    return `<div style="width:64px;height:36px;border-radius:4px;background:#000;flex-shrink:0"></div>`;
}

function clipPageUrl(clip: Clip): string {
    return `${location.origin}/${encodeURIComponent(clip.channel)}/clip/${encodeURIComponent(clip.id)}`;
}

function clipCellHtml(clip: Clip): string {
    const title = clip.title ? esc(clip.title) : esc(clip.id);
    return `
        <div style="display:flex;align-items:center;gap:10px">
            ${thumbnailHtml(clip)}
            <a href="${esc(clipPageUrl(clip))}" target="_blank" rel="noopener noreferrer" style="color:var(--text);font-weight:600">${title}</a>
        </div>`;
}

function actionsCellHtml(clip: Clip): string {
    const pageUrl = clipPageUrl(clip);
    return `
        <a class="btn btn-sm" href="${esc(pageUrl)}" target="_blank" rel="noopener noreferrer">Open</a>
        <button class="btn btn-sm" data-clip-copy="${esc(clip.id)}">Copy link</button>
        <button class="btn btn-sm btn-danger" data-clip-remove="${esc(clip.id)}">Delete</button>`;
}

function wireRowActions(tbody: HTMLElement, cache: Clip[]): void {
    tbody.querySelectorAll<HTMLButtonElement>("[data-clip-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset["clipCopy"] ?? "";
            const clip = cache.find(x => x.id === id);
            if (!clip) return;
            void copyText(clipPageUrl(clip)).then(copied => {
                btn.textContent = copied ? "Copied" : "Failed";
                setTimeout(() => { btn.textContent = "Copy link"; }, 1200);
            });
        });
    });
    tbody.querySelectorAll<HTMLButtonElement>("[data-clip-remove]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset["clipRemove"] ?? "";
            const clip = cache.find(x => x.id === id);
            if (!clip) return;
            const label = clip.title ? `"${clip.title}"` : "this clip";
            if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
            btn.disabled = true;
            try {
                await authFetch(`/api/clips/${encodeURIComponent(id)}`, { method: "DELETE" });
                removeClipEverywhere(id);
            } catch (e) {
                alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
                btn.disabled = false;
            }
        });
    });
}

function removeClipEverywhere(id: string): void {
    ownClipsCache = ownClipsCache.filter(x => x.id !== id);
    channelClipsCache = channelClipsCache.filter(x => x.id !== id);
    renderOwnClips();
    renderChannelClips();
}

async function loadOwnClips(): Promise<void> {
    const tbody = document.getElementById("clips-own-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty">Loading...</td></tr>`;
    try {
        const res = await authFetch<{ clips: Clip[] }>("/api/clips");
        ownClipsCache = res.clips;
        renderOwnClips();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(String(e))}</td></tr>`;
    }
}

function renderOwnClips(): void {
    const tbody = document.getElementById("clips-own-body");
    if (!tbody) return;
    if (!ownClipsCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">No clips yet. Cut one from a live stream's player.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    for (const c of ownClipsCache) {
        const tr = document.createElement("tr");
        const created = c.createdAt ? fmtDate(new Date(c.createdAt)) : "-";
        tr.innerHTML = `
            <td data-label="Clip">${clipCellHtml(c)}</td>
            <td data-label="Channel">${esc(c.channel)}</td>
            <td data-label="Created">${created}</td>
            <td data-label="Duration">${fmtDuration(c.durationMs)}</td>
            <td data-label="Status">${statusChipHtml(c.status)}</td>
            <td data-label="Actions" style="white-space:nowrap">${actionsCellHtml(c)}</td>`;
        tbody.appendChild(tr);
    }
    wireRowActions(tbody, ownClipsCache);
}

function hasStreamFlag(): boolean {
    const flags = new Set((getMe()?.flags ?? "").split(",").map(f => f.trim()).filter(Boolean));
    return flags.has("stream");
}

async function loadChannelClips(): Promise<void> {
    const card = document.getElementById("clips-channel-card");
    try {
        const res = await authFetch<{ clips: Clip[] }>("/api/clips/channel");
        channelClipsCache = res.clips;
        if (!channelClipsCache.length && !hasStreamFlag()) {
            if (card) card.style.display = "none";
            return;
        }
        if (card) card.style.display = "";
        renderChannelClips();
    } catch {
        if (card) card.style.display = "none";
    }
}

function renderChannelClips(): void {
    const tbody = document.getElementById("clips-channel-body");
    if (!tbody) return;
    if (!channelClipsCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">No clips from your channel yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    for (const c of channelClipsCache) {
        const tr = document.createElement("tr");
        const created = c.createdAt ? fmtDate(new Date(c.createdAt)) : "-";
        tr.innerHTML = `
            <td data-label="Clip">${clipCellHtml(c)}</td>
            <td data-label="Creator">${esc(c.creator)}</td>
            <td data-label="Created">${created}</td>
            <td data-label="Duration">${fmtDuration(c.durationMs)}</td>
            <td data-label="Status">${statusChipHtml(c.status)}</td>
            <td data-label="Actions" style="white-space:nowrap">${actionsCellHtml(c)}</td>`;
        tbody.appendChild(tr);
    }
    wireRowActions(tbody, channelClipsCache);
}

export function init(): void {}

export function activate(): void {
    void loadOwnClips();
    void loadChannelClips();
}
