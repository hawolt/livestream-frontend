import type { BillingTiers } from "../../api.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

let cache: BillingTiers | null = null;

async function loadTiers(): Promise<void> {
    const el = document.getElementById("sub-body");
    if (el) el.textContent = "Loading...";
    try {
        cache = await authFetch<BillingTiers>("/api/billing/tiers");
        render();
    } catch (e) {
        if (el) el.textContent = e instanceof Error ? e.message : String(e);
    }
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
    const statusBlock = active
        ? `<div style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:var(--radius)">
            <div><b>${esc(current!.tier)}</b> &middot; ${esc(current!.status)}</div>
            <div style="color:var(--muted);font-size:13px;margin-top:4px">Renews ${renewalDate}</div>
            <div style="margin-top:10px"><button class="btn" id="btn-sub-portal">Manage subscription</button></div>
        </div>`
        : "";
    const rows = cache.tiers.map(t => {
        const isCurrent = current?.tier === t.key;
        const action = isCurrent
            ? `<span style="color:var(--muted);font-size:13px">Current plan</span>`
            : `<button class="btn btn-primary" data-sub-tier="${esc(t.key)}">Subscribe</button>`;
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <div>
                <div><b>${esc(t.label)}</b></div>
                <div style="color:var(--muted);font-size:13px">${esc(t.price)}</div>
            </div>
            ${action}
        </div>`;
    }).join("");
    el.innerHTML = statusBlock + (rows || `<p style="color:var(--muted);font-size:13px;margin:0">No plans configured.</p>`);
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

export function init(): void {}

export function activate(): void {
    void loadTiers();
}
