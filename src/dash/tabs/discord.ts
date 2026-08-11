import type { LiveInfo } from "../../api.ts";
import { esc } from "../format.ts";
import { authFetch } from "../session.ts";

let liveCache: LiveInfo | null = null;

async function loadDiscord(): Promise<void> {
    const el = document.getElementById("live-discord-body");
    if (el) el.textContent = "Loading...";
    try {
        liveCache = await authFetch<LiveInfo>("/api/live");
        renderDiscord();
    } catch (e) {
        if (el) el.textContent = String(e);
    }
}

function renderDiscord(): void {
    const el = document.getElementById("live-discord-body");
    if (!el || !liveCache) return;
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Discord webhook URL <span class="form-hint">(empty disables)</span></span><input id="live-discord-url" type="text" maxlength="512" placeholder="https://discord.com/api/webhooks/..." value="${esc(liveCache.discordWebhookUrl)}"></label>
        </div>
        <div id="live-discord-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">
            In Discord: Server Settings &rarr; Integrations &rarr; Webhooks &rarr; New Webhook, then Copy Webhook URL.
        </div>
        <div class="card-actions">
            <button class="btn btn-primary" id="btn-live-discord-save">Save</button>
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

export function init(): void {}

export function activate(): void {
    void loadDiscord();
}
