import type { Clip } from "../../api.ts";
import { copyText } from "../../clipboard.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

let clipsCache: Clip[] = [];

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

async function loadClips(): Promise<void> {
    const tbody = document.getElementById("clips-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty">Loading...</td></tr>`;
    try {
        const res = await authFetch<{ clips: Clip[] }>("/api/clips");
        clipsCache = res.clips;
        renderClips();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(String(e))}</td></tr>`;
    }
}

function renderClips(): void {
    const tbody = document.getElementById("clips-body");
    if (!tbody) return;
    if (!clipsCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">No clips yet. Cut one from a live stream's player.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    for (const c of clipsCache) {
        const tr = document.createElement("tr");
        const pageUrl = clipPageUrl(c);
        const title = c.title ? esc(c.title) : esc(c.id);
        const created = c.createdAt ? fmtDate(new Date(c.createdAt)) : "-";
        tr.innerHTML = `
            <td data-label="Clip">
                <div style="display:flex;align-items:center;gap:10px">
                    ${thumbnailHtml(c)}
                    <span>${title}</span>
                </div>
            </td>
            <td data-label="Channel">${esc(c.channel)}</td>
            <td data-label="Created">${created}</td>
            <td data-label="Duration">${fmtDuration(c.durationMs)}</td>
            <td data-label="Status">${statusChipHtml(c.status)}</td>
            <td data-label="Actions" style="white-space:nowrap">
                <a class="btn btn-sm" href="${esc(pageUrl)}" target="_blank" rel="noopener noreferrer">Open</a>
                <button class="btn btn-sm" data-clip-copy="${esc(c.id)}">Copy link</button>
                <button class="btn btn-sm btn-danger" data-clip-remove="${esc(c.id)}">Delete</button>
            </td>`;
        tbody.appendChild(tr);
    }
    tbody.querySelectorAll<HTMLButtonElement>("[data-clip-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset["clipCopy"] ?? "";
            const clip = clipsCache.find(x => x.id === id);
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
            const clip = clipsCache.find(x => x.id === id);
            if (!clip) return;
            const label = clip.title ? `"${clip.title}"` : "this clip";
            if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
            btn.disabled = true;
            try {
                await authFetch(`/api/clips/${encodeURIComponent(id)}`, { method: "DELETE" });
                clipsCache = clipsCache.filter(x => x.id !== id);
                renderClips();
            } catch (e) {
                alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
                btn.disabled = false;
            }
        });
    });
}

export function init(): void {}

export function activate(): void {
    void loadClips();
}
