import type { LiveMod, LiveBan } from "../../api.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

const fmtUnix = (t: number | null | undefined): string =>
    t ? fmtDate(new Date(t * 1000)) : "-";

let modsCache: LiveMod[] = [];
let bansCache: LiveBan[] = [];

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

interface RaidResponse {
    target: string;
    seconds: number;
    viewers: number;
}

let raidTimer: number | null = null;
let raidDeadline = 0;
let raidActive: { target: string; viewers: number } | null = null;

function stopRaidTimer(): void {
    if (raidTimer !== null) {
        window.clearInterval(raidTimer);
        raidTimer = null;
    }
}

function raidSecondsLeft(): number {
    return Math.max(0, Math.ceil((raidDeadline - Date.now()) / 1000));
}

function renderRaidIdle(note = "", noteColor = "var(--muted)"): void {
    stopRaidTimer();
    raidActive = null;
    const el = document.getElementById("raid-box-body");
    if (!el) return;
    el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="raid-target" type="text" placeholder="channel to raid" maxlength="32" autocomplete="off" spellcheck="false" style="width:220px;max-width:240px;flex:none">
            <button class="btn btn-primary" id="raid-start">Raid</button>
        </div>
        <div id="raid-status" style="font-size:13px;min-height:16px;margin-top:6px;color:${noteColor}">${esc(note)}</div>`;
    const input = document.getElementById("raid-target") as HTMLInputElement;
    const btn = document.getElementById("raid-start") as HTMLButtonElement;
    const status = document.getElementById("raid-status")!;
    const start = async (): Promise<void> => {
        const target = input.value.trim();
        if (!target) return;
        btn.disabled = true;
        input.disabled = true;
        status.style.color = "var(--muted)";
        status.textContent = "Starting raid...";
        try {
            const res = await authFetch<RaidResponse>("/api/live/raid", {
                method: "POST",
                body: JSON.stringify({ target }),
            });
            renderRaidActive(res.target, res.seconds, res.viewers);
        } catch (e) {
            btn.disabled = false;
            input.disabled = false;
            status.style.color = "var(--red)";
            status.textContent = e instanceof Error ? e.message : String(e);
        }
    };
    btn.addEventListener("click", () => void start());
    input.addEventListener("keydown", ev => {
        if (ev.key === "Enter") void start();
    });
}

function renderRaidActive(target: string, seconds: number, viewers: number): void {
    const el = document.getElementById("raid-box-body");
    if (!el) return;
    raidActive = { target, viewers };
    raidDeadline = Date.now() + seconds * 1000;
    el.innerHTML = `
        <div style="font-size:13px;margin-bottom:10px">
            Raiding <b>${esc(target)}</b> with ${viewers} viewer${viewers === 1 ? "" : "s"} in <span id="raid-count">${seconds}</span>s
        </div>
        <button class="btn btn-danger" id="raid-cancel">Cancel</button>
        <div id="raid-status" style="font-size:13px;min-height:16px;margin-top:6px"></div>`;
    const cancelBtn = document.getElementById("raid-cancel") as HTMLButtonElement;
    const status = document.getElementById("raid-status")!;
    cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
            await authFetch("/api/live/raid", { method: "DELETE" });
            renderRaidIdle("Raid cancelled.");
        } catch (e) {
            cancelBtn.disabled = false;
            status.style.color = "var(--red)";
            status.textContent = e instanceof Error ? e.message : String(e);
        }
    });
    stopRaidTimer();
    raidTimer = window.setInterval(() => {
        const left = raidSecondsLeft();
        if (left <= 0) {
            renderRaidIdle("Raid sent. Your viewers are on their way.", "var(--success)");
            return;
        }
        const count = document.getElementById("raid-count");
        if (count) count.textContent = String(left);
    }, 250);
}

function renderRaid(): void {
    if (raidActive && raidSecondsLeft() > 0) {
        renderRaidActive(raidActive.target, raidSecondsLeft(), raidActive.viewers);
    } else {
        renderRaidIdle();
    }
}

export function init(): void {}

export function activate(): void {
    renderRaid();
    void loadMods();
    void loadBans();
}

export function deactivate(): void {
    stopRaidTimer();
}
