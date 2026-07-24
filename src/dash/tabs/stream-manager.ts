import type { LiveInfo, LiveCategory, LiveMod, LiveBan } from "../../api.ts";
import { esc, fmtDate, authFetch } from "../core.ts";

const fmtUnix = (t: number | null | undefined): string =>
    t ? fmtDate(new Date(t * 1000).toISOString()) : "-";

let liveCache: LiveInfo | null = null;
let categoriesCache: LiveCategory[] = [];
let modsCache: LiveMod[] = [];
let bansCache: LiveBan[] = [];

async function loadLive(): Promise<void> {
    const el = document.getElementById("live-info-body");
    if (el) el.textContent = "Loading...";
    try {
        const [info, cats] = await Promise.all([
            authFetch<LiveInfo>("/api/live"),
            authFetch<{ categories: LiveCategory[] }>("/api/live/categories"),
        ]);
        liveCache = info;
        categoriesCache = cats.categories;
        renderInfo();
    } catch (e) {
        if (el) el.textContent = String(e);
    }
}

function renderInfo(): void {
    const el = document.getElementById("live-info-body");
    if (!el || !liveCache) return;
    const options = [`<option value="" ${liveCache.categoryId === null ? "selected" : ""}>No category</option>`]
        .concat(categoriesCache.map(c =>
            `<option value="${c.id}" ${liveCache!.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`));
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Title</span><input id="live-info-title" type="text" maxlength="200" placeholder="Now streaming..." value="${esc(liveCache.title)}"></label>
            <label><span>Category</span><select id="live-info-category">${options.join("")}</select></label>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
            Shown under your video on the channel page and used to group streams on the explorer.
        </div>
        <div id="live-info-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
            <button class="btn btn-primary" id="btn-live-info-save">Save Stream Info</button>
            <span id="live-info-saved" style="font-size:13px;color:var(--success)"></span>
        </div>`;
    document.getElementById("btn-live-info-save")?.addEventListener("click", async () => {
        if (!liveCache) return;
        const btn = document.getElementById("btn-live-info-save") as HTMLButtonElement;
        const errEl = document.getElementById("live-info-error")!;
        const savedEl = document.getElementById("live-info-saved")!;
        const title = (document.getElementById("live-info-title") as HTMLInputElement).value;
        const catVal = (document.getElementById("live-info-category") as HTMLSelectElement).value;
        const categoryId = catVal === "" ? null : Number(catVal);
        errEl.textContent = "";
        savedEl.textContent = "";
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/info", {
                method: "PUT",
                body: JSON.stringify({ title, categoryId }),
            });
            renderInfo();
            const savedNow = document.getElementById("live-info-saved");
            if (savedNow) {
                savedNow.textContent = "Saved";
                setTimeout(() => { savedNow.textContent = ""; }, 2500);
            }
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            btn.disabled = false;
        }
    });
}

async function loadMods(): Promise<void> {
    const tbody = document.getElementById("live-mods-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="empty">Loading...</td></tr>`;
    try {
        const res = await authFetch<{ mods: LiveMod[] }>("/api/live/mods");
        modsCache = res.mods;
        renderMods();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="empty">${esc(String(e))}</td></tr>`;
    }
}

function renderMods(): void {
    const tbody = document.getElementById("live-mods-body");
    if (!tbody) return;
    if (!modsCache.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty">No moderators yet. Appoint one in chat with .mod USERNAME.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    for (const m of modsCache) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="Username">${esc(m.username)}</td>
            <td data-label="Added">${fmtUnix(m.createdAt)}</td>
            <td data-label="Actions" style="white-space:nowrap"><button class="btn btn-sm btn-danger" data-mod-remove="${m.id}">Remove</button></td>`;
        tbody.appendChild(tr);
    }
    tbody.querySelectorAll<HTMLButtonElement>("[data-mod-remove]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = Number(btn.dataset["modRemove"]);
            const mod = modsCache.find(x => x.id === id);
            if (!mod) return;
            if (!confirm(`Remove ${mod.username} as a moderator?`)) return;
            btn.disabled = true;
            try {
                await authFetch(`/api/live/mods/${id}`, { method: "DELETE" });
                modsCache = modsCache.filter(x => x.id !== id);
                renderMods();
            } catch (e) {
                alert("Remove failed: " + (e instanceof Error ? e.message : String(e)));
                btn.disabled = false;
            }
        });
    });
}

async function loadBans(): Promise<void> {
    const tbody = document.getElementById("live-bans-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty">Loading...</td></tr>`;
    try {
        const res = await authFetch<{ bans: LiveBan[] }>("/api/live/bans");
        bansCache = res.bans;
        renderBans();
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(String(e))}</td></tr>`;
    }
}

function renderBans(): void {
    const tbody = document.getElementById("live-bans-body");
    if (!tbody) return;
    if (!bansCache.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No banned users.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    for (const b of bansCache) {
        const tr = document.createElement("tr");
        const expiry = b.expiresAt ? fmtUnix(b.expiresAt) : "Permanent";
        const action = b.bannedByRank > 2
            ? `<span style="color:var(--muted);font-size:12px">Staff ban</span>`
            : `<button class="btn btn-sm btn-danger" data-ban-remove="${b.id}">Remove</button>`;
        tr.innerHTML = `
            <td data-label="Label">${esc(b.label)}</td>
            <td data-label="Banned by">${esc(b.bannedBy)}</td>
            <td data-label="Expires">${expiry}</td>
            <td data-label="Date">${fmtUnix(b.createdAt)}</td>
            <td data-label="Actions" style="white-space:nowrap">${action}</td>`;
        tbody.appendChild(tr);
    }
    tbody.querySelectorAll<HTMLButtonElement>("[data-ban-remove]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = Number(btn.dataset["banRemove"]);
            const ban = bansCache.find(x => x.id === id);
            if (!ban) return;
            if (!confirm(`Unban ${ban.label}?`)) return;
            btn.disabled = true;
            try {
                await authFetch(`/api/live/bans/${id}`, { method: "DELETE" });
                bansCache = bansCache.filter(x => x.id !== id);
                renderBans();
            } catch (e) {
                alert("Unban failed: " + (e instanceof Error ? e.message : String(e)));
                btn.disabled = false;
            }
        });
    });
}

export function init(): void {}

export function activate(): void {
    void loadLive();
    void loadMods();
    void loadBans();
}
