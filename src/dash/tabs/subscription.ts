import type { BillingPerks, BillingTiers } from "../../api.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

const PENDING_KEY = "sub-checkout-pending";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 120000;

let cache: BillingTiers | null = null;
let pollTimer: number | null = null;
let pollStartedAt = 0;

function perkLabels(perks: BillingPerks | undefined): string[] {
    if (!perks) return [];
    const out: string[] = [];
    if (perks.badge) out.push("Subscriber badge in chat");
    if (perks.chatColor) out.push("Custom chat name color");
    if (perks.adsOff) out.push("No ads");
    if (perks.largeUploads) out.push("Profile images up to 1 MiB");
    if (perks.animatedAvatar) out.push("Animated GIF profile images");
    if (perks.transcode) out.push("Quality options for your viewers");
    if (perks.irl) out.push("IRL ingests (SRT, SRTLA and RTMP)");
    if (perks.remoteobs) out.push("Remote OBS studio");
    if (perks.restream) out.push("Restream to other platforms");
    return out;
}

function pendingCheckout(): boolean {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || Date.now() - at > PENDING_MAX_AGE_MS) {
        sessionStorage.removeItem(PENDING_KEY);
        return false;
    }
    return true;
}

function clearPending(): void {
    sessionStorage.removeItem(PENDING_KEY);
    stopPolling();
    pollStartedAt = 0;
}

function stopPolling(): void {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function schedulePoll(): void {
    if (pollTimer !== null) return;
    if (!pollStartedAt) pollStartedAt = Date.now();
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
        clearPending();
        render();
        return;
    }
    pollTimer = window.setTimeout(() => {
        pollTimer = null;
        void loadTiers();
    }, POLL_INTERVAL_MS);
}

async function loadTiers(): Promise<void> {
    const el = document.getElementById("sub-body");
    if (el && !cache) el.textContent = "Loading...";
    try {
        cache = await authFetch<BillingTiers>("/api/billing/tiers");
    } catch (e) {
        if (el) el.textContent = e instanceof Error ? e.message : String(e);
        return;
    }
    if (cache.current && cache.current.tier) clearPending();
    render();
    if (pendingCheckout()) schedulePoll();
}

function render(): void {
    const el = document.getElementById("sub-body");
    if (!el || !cache) return;
    if (!cache.enabled) {
        el.innerHTML = `<p style="color:var(--muted);font-size:13px;margin:0">Subscriptions are not available right now.</p>`;
        return;
    }
    const current = cache.current;
    const active = current && current.tier;
    const renewalDate = current?.currentPeriodEnd
        ? fmtDate(new Date(current.currentPeriodEnd * 1000).toISOString())
        : "-";
    const pendingBanner = !active && pendingCheckout()
        ? `<div style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:var(--radius);color:var(--muted);font-size:13px">Waiting for the payment provider to confirm your subscription. This usually takes a few seconds. If you cancelled the checkout, ignore this message.</div>`
        : "";
    const statusBlock = active
        ? `<div style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:var(--radius)">
            <div><b>${esc(current!.tier)}</b> &middot; ${esc(current!.status)}</div>
            <div style="color:var(--muted);font-size:13px;margin-top:4px">Renews ${renewalDate}</div>
            <div style="margin-top:10px"><button class="btn" id="btn-sub-portal">Manage subscription</button></div>
        </div>`
        : "";
    const rows = cache.tiers.map(t => {
        const isCurrent = current?.tier === t.key;
        const perkItems = perkLabels(t.perks).map(p => `<li>${esc(p)}</li>`).join("");
        const perksBlock = perkItems
            ? `<ul style="margin:6px 0 0;padding-left:18px;color:var(--muted);font-size:13px">${perkItems}</ul>`
            : "";
        const action = isCurrent
            ? `<span style="color:var(--muted);font-size:13px">Current plan</span>`
            : `<button class="btn btn-primary" data-sub-tier="${esc(t.key)}">Subscribe</button>`;
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <div>
                <div><b>${esc(t.label)}</b></div>
                <div style="color:var(--muted);font-size:13px">${esc(t.price)}</div>
                ${perksBlock}
            </div>
            ${action}
        </div>`;
    }).join("");
    const feeNote = cache.feeNote
        ? `<p style="color:var(--muted);font-size:12px;margin:14px 0 0">${esc(cache.feeNote)}</p>`
        : "";
    el.innerHTML = pendingBanner + statusBlock + (rows || `<p style="color:var(--muted);font-size:13px;margin:0">No plans configured.</p>`) + feeNote;
    document.getElementById("btn-sub-portal")?.addEventListener("click", () => void openPortal());
    el.querySelectorAll<HTMLButtonElement>("[data-sub-tier]").forEach(btn => {
        btn.addEventListener("click", () => void checkout(btn));
    });
}

async function checkout(btn: HTMLButtonElement): Promise<void> {
    const tier = btn.dataset["subTier"];
    if (!tier) return;
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier }),
        });
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
        btn.disabled = false;
    }
}

async function openPortal(): Promise<void> {
    const btn = document.getElementById("btn-sub-portal") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/portal", { method: "POST" });
        location.href = res.url;
    } catch (e) {
        alert("Could not open the billing portal: " + (e instanceof Error ? e.message : String(e)));
        if (btn) btn.disabled = false;
    }
}

export function init(): void {
    window.addEventListener("subscription-changed", () => void loadTiers());
}

export function activate(): void {
    void loadTiers();
}

export function deactivate(): void {
    stopPolling();
}
