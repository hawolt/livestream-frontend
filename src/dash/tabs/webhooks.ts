import type { LiveInfo } from "../../api.ts";
import { fieldRow, wireField } from "../fields.ts";
import { esc } from "../format.ts";
import { openModal } from "../modal.ts";
import { authFetch } from "../session.ts";

let liveCache: LiveInfo | null = null;

export function init(): void {}

export function activate(): void {
    void loadWebhooks();
}

async function loadWebhooks(): Promise<void> {
    const el = document.getElementById("live-webhook-body");
    if (!el) return;
    try {
        liveCache = await authFetch<LiveInfo>("/api/live");
    } catch (e) {
        el.textContent = e instanceof Error ? e.message : String(e);
        return;
    }
    renderWebhooks();
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

function renderWebhooks(): void {
    const el = document.getElementById("live-webhook-body");
    if (!el || !liveCache) return;
    const hasSecret = liveCache.webhookSecret !== "";
    el.innerHTML = `
        <div class="form-grid">
            <label class="span2"><span>Stream start URL <span class="form-hint">(http/https, empty disables)</span></span><input id="live-wh-start" type="text" maxlength="512" placeholder="https://example.com/hooks/stream-start" value="${esc(liveCache.webhookStartUrl)}"></label>
            <label class="span2"><span>Stream end URL</span><input id="live-wh-end" type="text" maxlength="512" placeholder="https://example.com/hooks/stream-end" value="${esc(liveCache.webhookEndUrl)}"></label>
        </div>
        <div id="live-wh-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
        ${hasSecret ? fieldRow("Signing secret", liveCache.webhookSecret, "live-wh-secret", true) : `
        <div style="font-size:12px;color:var(--muted);margin-top:10px">
            A signing secret is generated when you first save a webhook URL.
        </div>`}
        <div class="card-actions">
            <button class="btn btn-primary" id="btn-live-wh-save">Save Webhooks</button>
            <button class="btn" id="btn-live-wh-integration">Integration</button>
            ${hasSecret ? `<button class="btn" id="btn-live-wh-rotate">Rotate Secret</button>` : ""}
        </div>`;
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
