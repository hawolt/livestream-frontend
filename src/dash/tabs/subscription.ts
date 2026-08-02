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

function featuredTierKey(tiers: BillingTier[]): string | null {
    const configured = (cache?.featuredTier ?? "").trim();
    if (!configured) return null;
    if (configured.toLowerCase() === "first") return tiers[0]?.key ?? null;
    return tiers.some(t => t.key === configured) ? configured : null;
}

const FALLBACK_ORDER = [
    "badge", "chat_color", "ads_off", "large_uploads", "animated_avatar",
];

const PERK_FIELD: Record<string, keyof BillingPerks> = {
    badge: "badge",
    chat_color: "chatColor",
    ads_off: "adsOff",
    large_uploads: "largeUploads",
    animated_avatar: "animatedAvatar",
};

function perkLabel(token: string): string {
    switch (token) {
        case "badge": return "Regular badge in chat";
        case "chat_color": return "Custom chat name color";
        case "ads_off": return "No ads";
        case "large_uploads": return "Profile images up to 1 MiB";
        case "animated_avatar": return "Animated GIF profile images";
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

const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
};

function priceHtml(rawPrice: string): string {
    const price = (rawPrice ?? "").trim();
    if (!price) return "";
    const configured = (cache?.currency ?? "").trim();
    const symbol = configured ? CURRENCY_SYMBOLS[configured.toUpperCase()] ?? configured : "";
    const amount = symbol && /^[\d.,\s]+$/.test(price) ? `${price} ${symbol}` : price;
    const interval = (cache?.priceInterval ?? "").trim();
    const suffix = interval ? ` <span class="sub-interval">/ ${esc(interval)}</span>` : "";
    return `${esc(amount)}${suffix}`;
}

function passButtonLabel(prefix: string): string {
    const days = cache?.passDays;
    return days ? `${prefix} ${days} days` : `${prefix} 30 days`;
}

function passCtaHtml(tier: BillingTier): string {
    if (!tier.passAvailable) return "";
    const price = tier.passPrice ? `<div class="sub-pass-price">${priceHtml(tier.passPrice)}</div>` : "";
    return `<div class="sub-pass-cta">
        <button class="btn" data-sub-pass-tier="${esc(tier.key)}">${esc(passButtonLabel("Buy"))}</button>
        ${price}
    </div>`;
}

function tierCard(tier: BillingTier, index: number, tiers: BillingTier[], tokenLists: string[][]): string {
    const current = cache?.current;
    const isCurrent = current?.tier === tier.key;
    const isPassHeld = isCurrent && current?.source === "pass";
    const currentRank = current ? tiers.find(t => t.key === current.tier)?.rank ?? null : null;
    const isFeatured = !isCurrent && tier.key === featuredTierKey(tiers);
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
        : isFeatured ? `<span class="sub-flag">BEST DEAL</span>` : "";
    let action: string;
    if (isPassHeld) {
        const until = current?.currentPeriodEnd
            ? fmtDate(new Date(current.currentPeriodEnd * 1000).toISOString())
            : "-";
        action = `<div class="sub-current-label">Pass active until ${esc(until)}</div>
            <div class="sub-cta"><button class="btn btn-primary" data-sub-pass-tier="${esc(tier.key)}">${esc(passButtonLabel("Extend"))}</button></div>`;
    } else if (isCurrent) {
        action = `<div class="sub-current-label">Active</div>`;
    } else if (currentRank === null) {
        action = `<div class="sub-cta"><button class="btn btn-primary" data-sub-tier="${esc(tier.key)}">Subscribe</button></div>${passCtaHtml(tier)}`;
    } else if (tier.rank > currentRank) {
        action = `<div class="sub-cta"><button class="btn btn-primary" data-sub-upgrade="${esc(tier.key)}">Upgrade</button></div>${passCtaHtml(tier)}`;
    } else {
        action = `<div class="sub-current-label" style="color:var(--muted)">Included in your plan</div>`;
    }
    const cls = ["sub-card", isCurrent ? "current" : "", isFeatured ? "featured" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}">
        ${flag}
        <div class="sub-tier-name">${esc(tier.label)}</div>
        <div class="sub-price">${priceHtml(tier.price)}</div>
        ${inherit}
        ${perksHtml}
        ${action}
    </div>`;
}

function portalButtonsHtml(): string {
    const providers = cache?.portalProviders ?? [];
    if (providers.length > 1) {
        return `<button class="btn" data-portal-provider="stripe">Manage subscription</button>
            <button class="btn" data-portal-provider="polar">Manage legacy subscription</button>`;
    }
    return `<button class="btn" data-portal-provider="">Manage subscription</button>`;
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
    const isPassHeld = current?.source === "pass";
    const renewalDate = current?.currentPeriodEnd
        ? fmtDate(new Date(current.currentPeriodEnd * 1000).toISOString())
        : "-";
    const head = `<p class="sub-head">Support the site and unlock extra features for chat, your profile and your stream. Cancel anytime, perks stay until the end of the paid period.</p>`;
    const pendingBanner = !active && pendingCheckout()
        ? `<div class="sub-pending">Waiting for the payment provider to confirm your subscription. This usually takes a few seconds. If you cancelled the checkout, ignore this message.</div>`
        : "";
    const showPortal = !isPassHeld || (cache.portalProviders?.length ?? 0) > 0;
    const statusBlock = active
        ? `<div class="sub-status">
            <b>${esc(current!.tier)}</b>
            <span>${esc(isPassHeld ? "Pass" : current!.status)}</span>
            <span>${isPassHeld ? "Pass active until " + esc(renewalDate) : "Renews " + esc(renewalDate)}</span>
            ${showPortal ? portalButtonsHtml() : ""}
            ${showPortal ? `<span>Downgrades and cancellation are handled there.</span>` : ""}
        </div>`
        : "";
    const tiers = [...cache.tiers].sort((a, b) => a.rank - b.rank);
    const tokenLists = tiers.map(t => perkTokens(t.perks));
    const grid = tiers.length
        ? `<div class="sub-grid">${tiers.map((t, i) => tierCard(t, i, tiers, tokenLists)).join("")}</div>`
        : `<p style="color:var(--muted);font-size:13px;margin:0">No plans configured.</p>`;
    const feeNote = cache.feeNote ? `<p class="sub-fee">${esc(cache.feeNote)}</p>` : "";
    el.innerHTML = head + pendingBanner + statusBlock + grid + feeNote;
    el.querySelectorAll<HTMLButtonElement>("[data-portal-provider]").forEach(btn => {
        btn.addEventListener("click", () => void openPortal(btn));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-sub-tier]").forEach(btn => {
        btn.addEventListener("click", () => void checkout(btn));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-sub-upgrade]").forEach(btn => {
        btn.addEventListener("click", () => void upgrade(btn));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-sub-pass-tier]").forEach(btn => {
        btn.addEventListener("click", () => void checkoutPass(btn, btn.dataset["subPassTier"]));
    });
}

async function upgrade(btn: HTMLButtonElement): Promise<void> {
    const tier = btn.dataset["subUpgrade"];
    if (!tier) return;
    const label = cache?.tiers.find(t => t.key === tier)?.label ?? tier;
    if (!confirm(`Upgrade to ${label}? The prorated price difference for the current period is charged immediately.`)) return;
    btn.disabled = true;
    try {
        await authFetch<{ ok: boolean }>("/api/billing/upgrade", {
            method: "POST",
            body: JSON.stringify({ tier }),
        });
        void loadTiers();
        window.setTimeout(() => void loadTiers(), 3000);
        window.setTimeout(() => void loadTiers(), 8000);
    } catch (e) {
        alert("Could not upgrade: " + (e instanceof Error ? e.message : String(e)));
        btn.disabled = false;
    }
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

async function checkoutPass(btn: HTMLButtonElement, tier: string | undefined): Promise<void> {
    if (!tier) return;
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier, pass: true }),
        });
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
        btn.disabled = false;
    }
}

async function openPortal(btn: HTMLButtonElement): Promise<void> {
    const provider = btn.dataset["portalProvider"] ?? "";
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/portal", {
            method: "POST",
            body: provider ? JSON.stringify({ provider }) : undefined,
        });
        location.href = res.url;
    } catch (e) {
        alert("Could not open the billing portal: " + (e instanceof Error ? e.message : String(e)));
        btn.disabled = false;
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
