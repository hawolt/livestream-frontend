import type { LiveInfo, RegionOption } from "../../api.ts";
import { esc, authFetch, maskSecret, openModal, loadRegions } from "../core.ts";

let liveCache: LiveInfo | null = null;
let regions: RegionOption[] = [];

async function loadLive(): Promise<void> {
    const ids = ["live-ingest-body", "live-playback-body", "live-channel-body", "live-webhook-body", "live-discord-body"];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.textContent = "Loading...";
    }
    try {
        regions = await loadRegions();
        liveCache = await authFetch<LiveInfo>("/api/live");
        renderIngest();
        renderPlayback();
        renderChannel();
        renderWebhooks();
        renderDiscord();
    } catch (e) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.textContent = String(e);
        }
    }
}

function fieldRow(label: string, value: string, id: string, secret: boolean): string {
    const shown = secret ? maskSecret(value) : value;
    return `
        <div style="margin-top:8px">
            <label style="font-size:12px;color:var(--muted)">${label}</label>
            <div style="display:flex;gap:6px;align-items:center">
                <code id="${id}" style="font-size:11px;word-break:break-all;flex:1">${esc(shown)}</code>
                ${secret ? `<button class="btn btn-sm" id="${id}-reveal">Reveal</button>` : ""}
                <button class="btn btn-sm" id="${id}-copy">Copy</button>
            </div>
        </div>`;
}

function wireField(id: string, value: string, secret: boolean): void {
    document.getElementById(`${id}-copy`)?.addEventListener("click", () => {
        const btn = document.getElementById(`${id}-copy`)!;
        navigator.clipboard.writeText(value).then(() => {
            btn.textContent = "Copied";
            setTimeout(() => { btn.textContent = "Copy"; }, 1200);
        }).catch(() => { btn.textContent = "Failed"; });
    });
    if (!secret) return;
    document.getElementById(`${id}-reveal`)?.addEventListener("click", () => {
        const btn = document.getElementById(`${id}-reveal`)!;
        const code = document.getElementById(id)!;
        const hidden = btn.textContent === "Reveal";
        code.textContent = hidden ? value : maskSecret(value);
        btn.textContent = hidden ? "Hide" : "Reveal";
    });
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
    const hlsUrl = liveCache.usernameOk ? `${hlsBase}/hls/${liveCache.username}/live.m3u8` : "";
    el.innerHTML = `
        ${server ? fieldRowEm("Playback URL", url, "live-playback-url", true)
                 : `<div style="font-size:13px;color:var(--red)">Live ingest host is not configured on the server.</div>`}
        ${hlsUrl ? fieldRowEm("HLS playlist", hlsUrl, "live-hls-url", false) : ""}
        <div style="margin-top:12px">
            <button class="btn" id="btn-live-playback-rotate">Rotate Playback Key</button>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">
            In OBS, add a Media Source, uncheck "Local File", paste the URL, and lower "Network Buffering" for the least delay.
            The HLS playlist plays in VLC, mpv or any HLS player while you are live; it is public, unlike the playback URL.
        </div>`;
    if (server) wireField("live-playback-url", url, true);
    if (hlsUrl) wireField("live-hls-url", hlsUrl, false);
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
    const url = `${liveCache.channelBase}/${liveCache.username}`;
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
                <input id="live-emote-twitch" type="text" placeholder="twitch username" value="${esc(liveCache.emoteTwitch ?? "")}" style="width:220px;max-width:240px;flex:none" autocomplete="off" spellcheck="false" />
                <button class="btn btn-primary" id="live-emote-save">Save</button>
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

function openWebhookIntegrationModal(): void {
    if (!liveCache) return;
    const payload = `POST <your URL>
Content-Type: application/json
X-Live-Signature: sha256=<HMAC-SHA256 of the body with your secret>
X-Live-Event-Id: <stable id, identical across retries>

{
  "event": "stream.end",
  "event_id": "5e884898da280471",
  "username": "${liveCache.username}",
  "timestamp": 1767139200,
  "started_at": 1767135600,
  "duration_seconds": 3600,
  "bytes_in": 2147483648
}`;
    openModal("Webhook Integration", `
        <div class="card" style="margin:0 0 12px 0;padding:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">Delivery</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.6">
                Each event is a JSON <code>POST</code> to your URL. A failed delivery is retried up to 3 times
                with the same event id, so de-duplicate on the <code>X-Live-Event-Id</code> header.
                An encoder reconnect fires an end and a start in quick succession; debounce on timestamps if needed.
            </div>
        </div>
        <div class="card" style="margin:0 0 12px 0;padding:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">Signature</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.6">
                Every delivery is signed with your secret:
                <code>X-Live-Signature: sha256=HMAC-SHA256(body, secret)</code>.
                Recompute the HMAC over the raw request body and compare it to the header before trusting the payload.
            </div>
        </div>
        <div class="card" style="margin:0 0 12px 0;padding:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">Payload example</div>
            <pre style="font-size:11px;background:var(--surface2);padding:8px;border-radius:3px;margin:0 0 8px 0;white-space:pre-wrap;word-break:break-all">${esc(payload)}</pre>
            <div style="font-size:12px;color:var(--muted);line-height:1.6">
                <code>stream.start</code> events omit <code>duration_seconds</code> and <code>bytes_in</code>.
            </div>
        </div>
    `, `<button class="btn" onclick="closeModal()">Close</button>`);
}

function renderDiscord(): void {
    const el = document.getElementById("live-discord-body");
    if (!el || !liveCache) return;
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Discord webhook URL <span style="color:var(--muted);font-size:12px">(empty disables)</span></span><input id="live-discord-url" type="text" maxlength="512" placeholder="https://discord.com/api/webhooks/..." value="${esc(liveCache.discordWebhookUrl)}"></label>
        </div>
        <div id="live-discord-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div style="margin-top:12px;display:flex;gap:6px">
            <button class="btn btn-primary" id="btn-live-discord-save">Save</button>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">
            In Discord: Server Settings &rarr; Integrations &rarr; Webhooks &rarr; New Webhook, then Copy Webhook URL.
        </div>`;
    document.getElementById("btn-live-discord-save")?.addEventListener("click", async () => {
        const btn = document.getElementById("btn-live-discord-save") as HTMLButtonElement;
        const errEl = document.getElementById("live-discord-error")!;
        const url = (document.getElementById("live-discord-url") as HTMLInputElement).value.trim();
        errEl.textContent = "";
        if (url && !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//i.test(url)) {
            errEl.textContent = "Enter a Discord webhook URL (https://discord.com/api/webhooks/...).";
            return;
        }
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/discord-webhook", {
                method: "POST",
                body: JSON.stringify({ url }),
            });
            renderDiscord();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            btn.disabled = false;
        }
    });
}

function renderWebhooks(): void {
    const el = document.getElementById("live-webhook-body");
    if (!el || !liveCache) return;
    const hasSecret = liveCache.webhookSecret !== "";
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Stream start URL <span style="color:var(--muted);font-size:12px">(http/https, empty disables)</span></span><input id="live-wh-start" type="text" maxlength="512" placeholder="https://example.com/hooks/stream-start" value="${esc(liveCache.webhookStartUrl)}"></label>
            <label class="span2"><span>Stream end URL</span><input id="live-wh-end" type="text" maxlength="512" placeholder="https://example.com/hooks/stream-end" value="${esc(liveCache.webhookEndUrl)}"></label>
        </div>
        <div id="live-wh-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div style="margin-top:12px;display:flex;gap:6px">
            <button class="btn btn-primary" id="btn-live-wh-save">Save Webhooks</button>
            <button class="btn" id="btn-live-wh-integration">Integration</button>
        </div>
        ${hasSecret ? `
        ${fieldRow("Signing secret", liveCache.webhookSecret, "live-wh-secret", true)}
        <div style="margin-top:12px">
            <button class="btn" id="btn-live-wh-rotate">Rotate Secret</button>
        </div>` : `
        <div style="font-size:12px;color:var(--muted);margin-top:10px">
            A signing secret is generated when you first save a webhook URL.
        </div>`}`;
    if (hasSecret) {
        wireField("live-wh-secret", liveCache.webhookSecret, true);
        document.getElementById("btn-live-wh-rotate")?.addEventListener("click", async () => {
            if (!confirm("Rotate the webhook signing secret? Deliveries signed with the old secret stop validating immediately.")) return;
            const btn = document.getElementById("btn-live-wh-rotate") as HTMLButtonElement;
            btn.disabled = true;
            try {
                liveCache = await authFetch<LiveInfo>("/api/live/webhooks/rotate-secret", { method: "POST" });
                renderWebhooks();
            } catch (e) {
                alert("Rotate failed: " + (e instanceof Error ? e.message : String(e)));
                btn.disabled = false;
            }
        });
    }
    document.getElementById("btn-live-wh-integration")?.addEventListener("click", openWebhookIntegrationModal);
    document.getElementById("btn-live-wh-save")?.addEventListener("click", async () => {
        const btn = document.getElementById("btn-live-wh-save") as HTMLButtonElement;
        const errEl = document.getElementById("live-wh-error")!;
        const startUrl = (document.getElementById("live-wh-start") as HTMLInputElement).value.trim();
        const endUrl   = (document.getElementById("live-wh-end") as HTMLInputElement).value.trim();
        errEl.textContent = "";
        for (const url of [startUrl, endUrl]) {
            if (url && !/^https?:\/\//.test(url)) {
                errEl.textContent = "Webhook URLs must start with http:// or https://";
                return;
            }
        }
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/webhooks", {
                method: "PUT",
                body: JSON.stringify({ startUrl, endUrl }),
            });
            renderWebhooks();
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            btn.disabled = false;
        }
    });
}

export function init(): void {}

export function activate(): void {
    void loadLive();
}
