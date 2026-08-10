import type { BillingAddon, BillingAddons, LiveInfo, RegionOption } from "../../api.ts";
import { copyText } from "../../clipboard.ts";
import { fieldRow, wireField } from "../fields.ts";
import { esc, maskSecret } from "../format.ts";
import { openModal } from "../modal.ts";
import { loadRegions } from "../regions.ts";
import { authFetch } from "../session.ts";
import { studioTabUrl } from "../studio.ts";
import { formatTicketPrice, parseTicketPrice, TICKET_MAX_CENTS, TICKET_MIN_CENTS } from "../../ticket-price.ts";

let liveCache: LiveInfo | null = null;
let regions: RegionOption[] = [];
let addonsCache: BillingAddons | null = null;

const STREAM_CARD_ADDONS = new Set(["thumbnail", "private", "ticketing"]);
const STUDIO_ADDONS = new Set(["irl", "remoteobs", "restream_plus", "restream_slot"]);

const ADDON_NOTE_FALLBACK: Record<string, string> = {
    transcode: "Gives your viewers quality options, so slow connections drop resolution instead of buffering.",
    fps_120: "Publish at up to 120 FPS with a raised bitrate ceiling.",
    fps_240: "Publish at up to 240 FPS with a raised bitrate ceiling.",
    res_2k: "Publish at up to 1440p with a raised bitrate ceiling.",
    res_4k: "Publish at up to 2160p with a raised bitrate ceiling.",
};

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

function addonPriceText(addon: BillingAddon): string {
    const price = (addon.price ?? "").trim();
    if (!price) return "";
    const currency = (addonsCache?.currency ?? "").trim().toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const amount = symbol && /^[\d.,\s]+$/.test(price) ? `${price} ${symbol}` : price;
    const interval = (addonsCache?.priceInterval ?? "").trim();
    return interval ? `${amount} / ${interval}` : amount;
}

function lockedAddon(key: string): BillingAddon | null {
    if (!addonsCache?.enabled) return null;
    const addon = addonsCache.addons.find(a => a.key === key);
    if (!addon || addon.active || addon.downgrade) return null;
    return addon;
}

function lockTagHtml(addon: BillingAddon): string {
    const price = addonPriceText(addon);
    return `<div class="lock-tag">${price ? `Addon · ${esc(price)}` : "Addon"}</div>`;
}

function lockActionsHtml(): string {
    return `<div class="card-actions"><a class="btn btn-sm" href="${esc(studioTabUrl("upgrades"))}">See Upgrades</a></div>`;
}

function applyCardLock(bodyId: string, locked: boolean): void {
    document.getElementById(bodyId)?.closest(".card")?.classList.toggle("locked", locked);
}

function renderLockedAddonCards(): void {
    const grid = document.querySelector("#pane-stream .card-grid-2");
    if (!grid) return;
    grid.querySelectorAll("[data-locked-addon]").forEach(el => el.remove());
    if (!addonsCache?.enabled) return;
    for (const addon of addonsCache.addons) {
        if (addon.active || addon.downgrade) continue;
        if (STREAM_CARD_ADDONS.has(addon.key) || STUDIO_ADDONS.has(addon.key)) continue;
        const note = (addon.note ?? "").trim() || ADDON_NOTE_FALLBACK[addon.key] || "";
        const card = document.createElement("div");
        card.className = "card locked";
        card.dataset["lockedAddon"] = addon.key;
        card.innerHTML = `
            <div class="section-title">${esc(addon.label)}</div>
            ${lockTagHtml(addon)}
            ${note ? `<p style="font-size:13px;color:var(--muted);margin:8px 0 0">${esc(note)}</p>` : ""}
            ${lockActionsHtml()}`;
        grid.appendChild(card);
    }
}

function formatCeiling(): string {
    const height = liveCache?.maxHeight;
    const fps = liveCache?.maxFps;
    if (typeof height !== "number" || height <= 0) return "";
    return typeof fps === "number" && fps > 0 ? `${height}p${fps}` : `${height}p`;
}

function renderStrip(): void {
    const el = document.getElementById("live-strip");
    if (!el || !liveCache) return;
    const stats: { label: string; value: string }[] = [];
    if (liveCache.regionLabel) stats.push({ label: "Region", value: liveCache.regionLabel });
    const ceiling = formatCeiling();
    if (ceiling) stats.push({ label: "Ceiling", value: ceiling });
    if (!stats.length) {
        el.replaceChildren();
        return;
    }
    el.innerHTML = `<div class="dash-strip">${stats.map(s => `
        <div class="dash-stat">
            <div class="dash-stat-label">${esc(s.label)}</div>
            <div class="dash-stat-value">${esc(s.value)}</div>
        </div>`).join("")}</div>`;
}

async function loadLive(): Promise<void> {
    const ids = ["live-ingest-body", "live-playback-body", "live-channel-body", "live-thumbnail-body", "live-private-body", "live-ticket-body"];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.textContent = "Loading...";
    }
    try {
        const addonsPromise = authFetch<BillingAddons>("/api/billing/addons").catch(() => null);
        regions = await loadRegions();
        liveCache = await authFetch<LiveInfo>("/api/live");
        addonsCache = await addonsPromise;
        renderStrip();
        renderIngest();
        renderPlayback();
        renderChannel();
        renderThumbnail();
        renderPrivate();
        renderTicket();
        renderLockedAddonCards();
    } catch (e) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.textContent = String(e);
        }
    }
}

function fieldRowEm(label: string, value: string, id: string, secret: boolean, extra = ""): string {
    const shown = secret ? maskSecret(value) : value;
    return `
        <div style="margin-top:8px">
            <label style="font-size:12px;color:var(--text)">${label}</label>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <code id="${id}" style="font-size:11px;word-break:break-all;color:#fff;font-weight:600;flex:1">${esc(shown)}</code>
                ${secret ? `<button class="btn btn-sm" id="${id}-reveal">Reveal</button>` : ""}
                <button class="btn btn-sm" id="${id}-copy">Copy</button>${extra}
            </div>
        </div>`;
}

function renderIngest(): void {
    const el = document.getElementById("live-ingest-body");
    if (!el || !liveCache) return;
    const server = liveCache.ingestServer;
    el.innerHTML = `
        ${server ? fieldRowEm("RTMP URL", server, "live-ingest-server", false)
                 : `<div style="font-size:13px;color:var(--red)">Live ingest host is not configured on the server.</div>`}
        ${fieldRowEm("Stream key", liveCache.streamKey, "live-ingest-key", true, `<button class="btn btn-sm" id="btn-live-rotate">Rotate</button>`)}
        ${regions.length > 1 ? `
        <div style="margin-top:10px">
            <label style="font-size:12px;color:var(--text)">Region</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <select id="live-region-select">${regions.map(r => `<option value="${esc(r.id)}"${r.id === (liveCache!.region ?? "") ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Publish to the region closest to you. Changing it updates the RTMP URL and disconnects an active stream.</div>
        </div>` : ""}`;
    if (server) wireField("live-ingest-server", server, false);
    wireField("live-ingest-key", liveCache.streamKey, true);
    document.getElementById("live-region-select")?.addEventListener("change", async (e) => {
        if (!liveCache) return;
        const sel = e.currentTarget as HTMLSelectElement;
        const prev = liveCache.region ?? "";
        const next = sel.value;
        if (next === prev) return;
        sel.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/region", {
                method: "POST",
                body: JSON.stringify({ region: next }),
            });
            renderStrip();
            renderIngest();
            renderPlayback();
        } catch (err) {
            sel.value = prev;
            sel.disabled = false;
            alert("Region change failed: " + (err instanceof Error ? err.message : String(err)));
        }
    });
    document.getElementById("btn-live-rotate")?.addEventListener("click", async () => {
        if (!confirm("Rotate the ingest stream key? The current key stops working for the next publish.")) return;
        const btn = document.getElementById("btn-live-rotate") as HTMLButtonElement;
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/rotate-key", { method: "POST" });
            renderIngest();
        } catch (e) {
            alert("Rotate failed: " + (e instanceof Error ? e.message : String(e)));
            btn.disabled = false;
        }
    });
}

function renderPlayback(): void {
    const el = document.getElementById("live-playback-body");
    if (!el || !liveCache) return;
    const server = liveCache.ingestServer;
    const url = server ? `${server}/${liveCache.playbackKey}` : "";
    const hlsBase = (liveCache.mediaBase || "").replace(/\/+$/, "") || window.location.origin;
    const hlsUrl = liveCache.usernameOk ? `${hlsBase}/hls/${liveCache.username.toLowerCase()}/live.m3u8` : "";
    el.innerHTML = `
        ${server ? fieldRowEm("Playback URL", url, "live-playback-url", true)
                 : `<div style="font-size:13px;color:var(--red)">Live ingest host is not configured on the server.</div>`}
        <div class="card-actions" style="flex-direction:column">
            ${hlsUrl ? `<button class="btn" id="btn-live-hls-copy" style="width:100%">Copy HLS Playlist URL</button>` : ""}
            <button class="btn" id="btn-live-playback-rotate" style="width:100%">Rotate Playback Key</button>
        </div>`;
    if (server) wireField("live-playback-url", url, true);
    if (hlsUrl) {
        document.getElementById("btn-live-hls-copy")?.addEventListener("click", () => {
            const btn = document.getElementById("btn-live-hls-copy")!;
            void copyText(hlsUrl).then(copied => {
                btn.textContent = copied ? "Copied" : "Copy failed";
                setTimeout(() => { btn.textContent = "Copy HLS Playlist URL"; }, 1200);
            });
        });
    }
    document.getElementById("btn-live-playback-rotate")?.addEventListener("click", async () => {
        if (!confirm("Rotate the playback key? The current playback URL stops working immediately.")) return;
        const btn = document.getElementById("btn-live-playback-rotate") as HTMLButtonElement;
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/playback-key/rotate", { method: "POST" });
            renderPlayback();
        } catch (e) {
            alert("Rotate failed: " + (e instanceof Error ? e.message : String(e)));
            btn.disabled = false;
        }
    });
}

function renderChannel(): void {
    const el = document.getElementById("live-channel-body");
    if (!el || !liveCache) return;
    if (!liveCache.usernameOk) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red)">
            Your username contains characters that cannot appear in a channel URL
            (allowed: letters, digits, - and _, 3-32 characters), so no channel page is available for this account.
        </div>`;
        return;
    }
    if (!liveCache.channelBase) {
        el.innerHTML = `<div style="font-size:13px;color:var(--red)">The channel page base URL is not configured on the server.</div>`;
        return;
    }
    const url = `${liveCache.channelBase}/${liveCache.username.toLowerCase()}`;
    el.innerHTML = `
        ${fieldRow("Public channel URL", url, "live-channel-url", false)}
        <div style="margin-top:12px">
            <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Open Channel Page</a>
        </div>
        <div style="margin-top:22px">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">Extra chat emotes (7TV)</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:8px">
                Borrow another channel's 7TV emote set by entering a Twitch username
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <input id="live-emote-twitch" type="text" placeholder="twitch username" value="${esc(liveCache.emoteTwitch ?? "")}" style="flex:1;min-width:0" autocomplete="off" spellcheck="false" />
                <button class="btn btn-primary" id="live-emote-save" style="flex:0 0 auto">Save</button>
            </div>
            <div id="live-emote-status" style="font-size:12px;min-height:16px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
        </div>`;
    wireField("live-channel-url", url, false);
    document.getElementById("live-emote-save")?.addEventListener("click", async () => {
        const input = document.getElementById("live-emote-twitch") as HTMLInputElement;
        const status = document.getElementById("live-emote-status");
        if (!input || !status) return;
        status.textContent = "Saving…";
        status.style.color = "var(--muted)";
        try {
            const res = await authFetch<{ emoteTwitch: string }>("/api/live/emote-twitch", { method: "POST", body: JSON.stringify({ twitch: input.value.trim() }) });
            if (liveCache) liveCache.emoteTwitch = res.emoteTwitch;
            input.value = res.emoteTwitch;
            status.textContent = res.emoteTwitch ? `Saved - using ${res.emoteTwitch}'s emotes` : "Cleared";
            status.style.color = "var(--success)";
        } catch (e) {
            status.textContent = e instanceof Error ? e.message : String(e);
            status.style.color = "var(--red)";
        }
    });
}

function thumbnailKib(): number {
    const bytes = liveCache?.maxImageBytes;
    return typeof bytes === "number" && bytes > 0 ? Math.floor(bytes / 1024) : 256;
}

function renderThumbnail(): void {
    const el = document.getElementById("live-thumbnail-body");
    if (!el || !liveCache) return;
    const allowed = liveCache.thumbnailAllowed === true;
    const lock = !allowed && !liveCache.hasThumbnail ? lockedAddon("thumbnail") : null;
    applyCardLock("live-thumbnail-body", lock !== null);
    if (lock) {
        el.innerHTML = `${lockTagHtml(lock)}${lockActionsHtml()}`;
        return;
    }
    const version = liveCache.thumbnailVersion;
    const previewUrl = liveCache.hasThumbnail && liveCache.usernameOk
        ? `/api/live/thumbnail/${encodeURIComponent(liveCache.username.toLowerCase())}?v=${version ?? 0}`
        : "";
    el.innerHTML = `
        ${allowed ? "" : `<p style="color:var(--muted);font-size:13px;margin:0 0 12px">A subscription is required to upload a custom thumbnail. <a href="/dashboard/subscription" data-switch-tab="subscription">See subscription plans</a>.</p>`}
        ${previewUrl ? `<img id="live-thumb-preview" src="${esc(previewUrl)}" alt="Stream thumbnail" style="display:block;width:100%;max-width:320px;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--border);border-radius:6px;margin-bottom:10px">` : ""}
        <input id="live-thumb-file" type="file" accept="image/png,image/jpeg" hidden>
        <div style="font-size:12px;color:var(--muted)">JPG or PNG, 16:9 recommended, up to ${thumbnailKib()} KiB and 2560x1440.</div>
        <div id="live-thumb-error" style="color:var(--red);font-size:13px;margin-top:6px"></div>
        <div class="card-actions">
            <button class="btn btn-primary" id="live-thumb-upload" ${allowed ? "" : "disabled"}>${liveCache.hasThumbnail ? "Replace" : "Upload"}</button>
            ${liveCache.hasThumbnail ? `<button class="btn" id="live-thumb-remove">Remove</button>` : ""}
        </div>`;
    const fileInput = document.getElementById("live-thumb-file") as HTMLInputElement;
    const uploadBtn = document.getElementById("live-thumb-upload") as HTMLButtonElement;
    const errEl = document.getElementById("live-thumb-error")!;
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file || !liveCache) return;
        errEl.textContent = "";
        if (!["image/png", "image/jpeg"].includes(file.type)) {
            errEl.textContent = "Unsupported format, use JPG or PNG.";
            return;
        }
        const maxBytes = liveCache.maxImageBytes ?? 256 * 1024;
        if (file.size > maxBytes) {
            errEl.textContent = `Image exceeds the ${thumbnailKib()} KiB limit for this account.`;
            return;
        }
        uploadBtn.disabled = true;
        try {
            const bytes = await file.arrayBuffer();
            const res = await authFetch<LiveInfo>("/api/live/thumbnail", {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: bytes,
            });
            liveCache = { ...liveCache, ...res };
            renderThumbnail();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            uploadBtn.disabled = false;
        }
    });
    document.getElementById("live-thumb-remove")?.addEventListener("click", async () => {
        if (!confirm("Remove the custom thumbnail? Browse falls back to the automatic stream screenshot.")) return;
        if (!liveCache) return;
        errEl.textContent = "";
        try {
            const res = await authFetch<LiveInfo>("/api/live/thumbnail", { method: "DELETE" });
            liveCache = { ...liveCache, ...res };
            renderThumbnail();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
        }
    });
}

function renderPrivate(): void {
    const el = document.getElementById("live-private-body");
    if (!el || !liveCache) return;
    const allowed = liveCache.privateAllowed === true;
    const active = liveCache.passwordProtected === true;
    const lock = !allowed && !active ? lockedAddon("private") : null;
    applyCardLock("live-private-body", lock !== null);
    if (lock) {
        el.innerHTML = `${lockTagHtml(lock)}${lockActionsHtml()}`;
        return;
    }
    el.innerHTML = `
        ${allowed || active ? "" : `<p style="color:var(--muted);font-size:13px;margin:0 0 12px">A subscription is required to make your stream private. <a href="/dashboard/subscription" data-switch-tab="subscription">See subscription plans</a>.</p>`}
        ${active ? `<div style="font-size:13px;color:var(--success);margin-bottom:10px">Password protection is on. Your channel is hidden from Browse.</div>` : ""}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="live-private-pass" type="password" placeholder="${active ? "New stream password" : "Stream password"}" minlength="4" maxlength="64" autocomplete="new-password" style="width:220px;max-width:240px;flex:none" ${allowed ? "" : "disabled"}>
            <button class="btn btn-primary" id="live-private-save" ${allowed ? "" : "disabled"}>${active ? "Change" : "Enable"}</button>
            ${active ? `<button class="btn" id="live-private-off">Disable</button>` : ""}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">
            Chat locks within a minute of a change. Video applies from the next stream start, so set the password before going live.
        </div>
        <div id="live-private-error" style="color:var(--red);font-size:13px;margin-top:6px"></div>`;
    const input = document.getElementById("live-private-pass") as HTMLInputElement;
    const errEl = document.getElementById("live-private-error")!;
    const save = async (password: string): Promise<void> => {
        errEl.textContent = "";
        try {
            const res = await authFetch<LiveInfo>("/api/live/password", {
                method: "PUT",
                body: JSON.stringify({ password }),
            });
            liveCache = { ...liveCache!, ...res };
            renderPrivate();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
        }
    };
    document.getElementById("live-private-save")?.addEventListener("click", () => {
        const password = input.value;
        if (password.length < 4 || password.length > 64) {
            errEl.textContent = "Password must be 4 to 64 characters.";
            return;
        }
        void save(password);
    });
    document.getElementById("live-private-off")?.addEventListener("click", () => {
        if (!confirm("Disable password protection? Your channel becomes public and shows on Browse again.")) return;
        void save("");
    });
}

function renderTicket(): void {
    const el = document.getElementById("live-ticket-body");
    if (!el || !liveCache) return;
    const allowed = liveCache.ticketingAllowed === true;
    const priceCents = typeof liveCache.ticketPriceCents === "number" ? liveCache.ticketPriceCents : null;
    const active = priceCents !== null && priceCents > 0;
    const days = liveCache.ticketDays ?? 30;
    const currentValue = active ? (priceCents / 100).toFixed(2) : "";
    const lock = !allowed && !active ? lockedAddon("ticketing") : null;
    applyCardLock("live-ticket-body", lock !== null);
    if (lock) {
        el.innerHTML = `${lockTagHtml(lock)}${lockActionsHtml()}`;
        return;
    }
    el.innerHTML = `
        ${allowed || active ? "" : `<p style="color:var(--muted);font-size:13px;margin:0 0 12px">A subscription is required to sell tickets. <a href="/dashboard/subscription" data-switch-tab="subscription">See subscription plans</a>.</p>`}
        ${active ? `<div style="font-size:13px;color:var(--success);margin-bottom:10px">Tickets are on at ${esc(formatTicketPrice(priceCents!, liveCache.ticketCurrency))}. Your channel is hidden from Browse.</div>` : ""}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="live-ticket-price" type="text" inputmode="decimal" placeholder="${active ? "New ticket price" : "Ticket price"}" value="${esc(currentValue)}" style="width:160px;max-width:200px;flex:none" ${allowed ? "" : "disabled"}>
            <button class="btn btn-primary" id="live-ticket-save" ${allowed ? "" : "disabled"}>${active ? "Change" : "Enable"}</button>
            ${active ? `<button class="btn" id="live-ticket-off">Disable</button>` : ""}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">
            ${esc((TICKET_MIN_CENTS / 100).toFixed(2))} to ${esc((TICKET_MAX_CENTS / 100).toFixed(0))} per ticket. A ticket lasts ${esc(String(days))} days and the buyer can renew it.
            Chat locks within a minute of a change; video applies from the next stream start.
        </div>
        <div id="live-ticket-error" style="color:var(--red);font-size:13px;margin-top:6px"></div>`;
    const input = document.getElementById("live-ticket-price") as HTMLInputElement;
    const errEl = document.getElementById("live-ticket-error")!;
    const save = async (cents: number | null): Promise<void> => {
        errEl.textContent = "";
        try {
            const res = await authFetch<LiveInfo>("/api/live/ticket", {
                method: "PUT",
                body: JSON.stringify({ priceCents: cents }),
            });
            liveCache = { ...liveCache!, ...res };
            renderTicket();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
        }
    };
    document.getElementById("live-ticket-save")?.addEventListener("click", () => {
        const cents = parseTicketPrice(input.value);
        if (cents === null) {
            errEl.textContent = `Enter a price between ${(TICKET_MIN_CENTS / 100).toFixed(2)} and ${(TICKET_MAX_CENTS / 100).toFixed(0)}.`;
            return;
        }
        void save(cents);
    });
    document.getElementById("live-ticket-off")?.addEventListener("click", () => {
        if (!confirm("Stop selling tickets? Your channel becomes public again unless a password is set. Tickets already sold stay valid until they expire.")) return;
        void save(null);
    });
}


export function init(): void {}

export function activate(): void {
    void loadLive();
}
