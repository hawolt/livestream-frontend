import type { BillingPerks, BillingTier, BillingTiers } from "../../api.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

const PENDING_KEY = "sub-checkout-pending";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 120000;

let cache: BillingTiers | null = null;
let pollTimer: number | null = null;
let pollStartedAt = 0;

const FALLBACK_ORDER = [
    "badge", "chat_color", "ads_off", "large_uploads", "animated_avatar",
    "transcode", "irl", "remoteobs", "restream", "restream_plus",
];

const PERK_FIELD: Record<string, keyof BillingPerks> = {
    badge: "badge",
    chat_color: "chatColor",
    ads_off: "adsOff",
    large_uploads: "largeUploads",
    animated_avatar: "animatedAvatar",
    transcode: "transcode",
    irl: "irl",
    remoteobs: "remoteobs",
    restream: "restream",
    restream_plus: "restreamPlus",
};

function perkLabel(token: string): string {
    switch (token) {
        case "badge": return "Subscriber badge in chat";
        case "chat_color": return "Custom chat name color";
        case "ads_off": return "No ads";
        case "large_uploads": return "Profile images up to 1 MiB";
        case "animated_avatar": return "Animated GIF profile images";
        case "transcode": return "Quality options for your viewers";
        case "irl": return "IRL ingests (SRT, SRTLA and RTMP)";
        case "remoteobs": return "Remote OBS studio";
        case "restream": {
            const cap = cache?.restreamDestinationCap ?? 0;
            return cap > 0 ? `Restream to up to ${cap} other platforms` : "Restream to other platforms";
        }
        case "restream_plus": return "Restream without broadcasting to this site";
        default: return token;
    }
}

function perkTokens(perks: BillingPerks | undefined): string[] {
    if (!perks) return [];
    if (Array.isArray(perks.order) && perks.order.length) {
        return perks.order.filter(t => PERK_FIELD[t] !== undefined);
    }
    return FALLBACK_ORDER.filter(t => perks[PERK_FIELD[t]!] === true);
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

function tierCard(tier: BillingTier, index: number, tiers: BillingTier[], tokenLists: string[][]): string {
    const current = cache?.current;
    const isCurrent = current?.tier === tier.key;
    const isFeatured = !isCurrent && tiers.length >= 2 && index === tiers.length - 1;
    const tokens = tokenLists[index]!;
    let inherit = "";
    let shown = tokens;
    if (index > 0) {
        const prev = tokenLists[index - 1]!;
        const prevSet = new Set(prev);
        if (prev.length && prev.every(t => tokens.includes(t))) {
            const delta = tokens.filter(t => !prevSet.has(t));
            inherit = `<p class="sub-inherit">Everything in ${esc(tiers[index - 1]!.label)}${delta.length ? ", plus:" : ""}</p>`;
            shown = delta;
        }
    }
    const perksHtml = shown.length
        ? `<ul class="sub-perks">${shown.map(t => `<li>${esc(perkLabel(t))}</li>`).join("")}</ul>`
        : "";
    const flag = isCurrent
        ? `<span class="sub-flag">YOUR PLAN</span>`
        : isFeatured ? `<span class="sub-flag">BEST VALUE</span>` : "";
    const action = isCurrent
        ? `<div class="sub-current-label">Active</div>`
        : `<div class="sub-cta"><button class="btn btn-primary" data-sub-tier="${esc(tier.key)}">Subscribe</button></div>`;
    const cls = ["sub-card", isCurrent ? "current" : "", isFeatured ? "featured" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}">
        ${flag}
        <div class="sub-tier-name">${esc(tier.label)}</div>
        <div class="sub-price">${esc(tier.price)}</div>
        ${inherit}
        ${perksHtml}
        ${action}
    </div>`;
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
    const head = `<p class="sub-head">Support the site and unlock extra features for chat, your profile and your stream. Cancel anytime, perks stay until the end of the paid period.</p>`;
    const pendingBanner = !active && pendingCheckout()
        ? `<div class="sub-pending">Waiting for the payment provider to confirm your subscription. This usually takes a few seconds. If you cancelled the checkout, ignore this message.</div>`
        : "";
    const statusBlock = active
        ? `<div class="sub-status">
            <b>${esc(current!.tier)}</b>
            <span>${esc(current!.status)}</span>
            <span>Renews ${renewalDate}</span>
            <button class="btn" id="btn-sub-portal">Manage subscription</button>
        </div>`
        : "";
    const tiers = [...cache.tiers].sort((a, b) => a.rank - b.rank);
    const tokenLists = tiers.map(t => perkTokens(t.perks));
    const grid = tiers.length
        ? `<div class="sub-grid">${tiers.map((t, i) => tierCard(t, i, tiers, tokenLists)).join("")}</div>`
        : `<p style="color:var(--muted);font-size:13px;margin:0">No plans configured.</p>`;
    const feeNote = cache.feeNote ? `<p class="sub-fee">${esc(cache.feeNote)}</p>` : "";
    el.innerHTML = head + pendingBanner + statusBlock + grid + feeNote;
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
