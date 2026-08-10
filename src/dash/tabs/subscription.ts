import type { BillingFounder, BillingPerks, BillingTier, BillingTiers } from "../../api.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";

const PENDING_KEY = "sub-checkout-pending";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 120000;

let cache: BillingTiers | null = null;
let founderCache: BillingFounder | null = null;
let pollTimer: number | null = null;
let pollStartedAt = 0;
let activationGeneration = 0;
let loadRevision = 0;
let upgradeRevision = 0;
let founderRevision = 0;
let active = false;

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

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
        default: return token.startsWith("badge_") ? "Exclusive badge in chat" : token;
    }
}

function perkTokens(perks: BillingPerks | undefined): string[] {
    if (!perks) return [];
    if (Array.isArray(perks.order) && perks.order.length) {
        return perks.order.filter(t => PERK_FIELD[t] !== undefined || t.startsWith("badge_"));
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

function schedulePoll(generation: number): void {
    if (!isCurrentActivation(generation) || pollTimer !== null) return;
    if (!pollStartedAt) pollStartedAt = Date.now();
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
        clearPending();
        render();
        return;
    }
    pollTimer = window.setTimeout(() => {
        pollTimer = null;
        void loadTiers(generation);
    }, POLL_INTERVAL_MS);
}

async function loadTiers(generation: number): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const revision = ++loadRevision;
    const el = document.getElementById("sub-body");
    if (el && !cache) el.textContent = "Loading...";
    try {
        const loaded = await authFetch<BillingTiers>("/api/billing/tiers");
        if (!isCurrentActivation(generation) || revision !== loadRevision) return;
        cache = loaded;
    } catch (e) {
        if (!isCurrentActivation(generation) || revision !== loadRevision) return;
        if (el && !cache) el.textContent = e instanceof Error ? e.message : String(e);
        if (pendingCheckout()) schedulePoll(generation);
        return;
    }
    if (cache.current && cache.current.tier) clearPending();
    render();
    if (pendingCheckout()) schedulePoll(generation);
    void loadFounder(generation);
}

async function loadFounder(generation: number): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const revision = ++founderRevision;
    let loaded: BillingFounder;
    try {
        loaded = await authFetch<BillingFounder>("/api/billing/founder");
    } catch {
        return;
    }
    if (!isCurrentActivation(generation) || revision !== founderRevision) return;
    founderCache = loaded;
    render();
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
};

function amountHtml(rawPrice: string, currency: string): string {
    const price = (rawPrice ?? "").trim();
    if (!price) return "";
    const configured = (currency ?? "").trim();
    const symbol = configured ? CURRENCY_SYMBOLS[configured.toUpperCase()] ?? configured : "";
    const amount = symbol && /^[\d.,\s]+$/.test(price) ? `${price} ${symbol}` : price;
    return esc(amount);
}

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
    const price = tier.passPrice
        ? `<div class="sub-pass-price">${amountHtml(tier.passPrice, cache?.currency ?? "")} <span class="sub-interval">one time</span></div>`
        : "";
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
        const covers = (t: string): boolean =>
            tokens.includes(t) || (t === "badge" && tokens.some(x => x.startsWith("badge_")));
        if (prev.length && prev.every(covers)) {
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
            ? fmtDate(new Date(current.currentPeriodEnd * 1000))
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

function portalButtonLabel(): string {
    return "Manage subscription";
}

function portalButtonsHtml(): string {
    const providers = cache?.portalProviders ?? [];
    return providers
        .map(provider => `<button class="btn" data-portal-provider="${esc(provider)}">${esc(portalButtonLabel())}</button>`)
        .join("");
}

function render(): void {
    if (!active) return;
    const el = document.getElementById("sub-body");
    if (!el || !cache) return;
    if (!cache.enabled) {
        el.innerHTML = `<p style="color:var(--muted);font-size:13px;margin:0">Subscriptions are not available right now.</p>`;
        return;
    }
    const current = cache.current;
    const activePlan = current && current.tier;
    const isPassHeld = current?.source === "pass";
    const renewalDate = current?.currentPeriodEnd
        ? fmtDate(new Date(current.currentPeriodEnd * 1000))
        : "-";
    const head = `<p class="sub-head">Support the site and unlock extra features for chat, your profile and your stream. Cancel anytime, perks stay until the end of the paid period.</p>`;
    const pendingBanner = !activePlan && pendingCheckout()
        ? `<div class="sub-pending">Waiting for the payment provider to confirm your subscription. This usually takes a few seconds. If you cancelled the checkout, ignore this message.</div>`
        : "";
    const showPortal = !isPassHeld || (cache.portalProviders?.length ?? 0) > 0;
    const statusBlock = activePlan
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
    el.innerHTML = head + pendingBanner + statusBlock + grid + founderCardHtml() + feeNote;
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
    el.querySelector<HTMLButtonElement>("#sub-founder-buy")?.addEventListener("click", function () {
        void checkoutFounder(this);
    });
}

function founderCardHtml(): string {
    const founder = founderCache;
    if (!founder || !founder.enabled) return "";
    const label = founder.label || "Founder";
    const price = amountHtml(founder.price, founder.currency ?? cache?.currency ?? "");
    const soldOut = founder.available <= 0;
    let action: string;
    if (founder.owned) {
        action = `<div class="sub-current-label">Yours</div>`;
    } else if (soldOut) {
        action = `<div class="sub-current-label" style="color:var(--muted)">Sold out</div>`;
    } else {
        action = `<div class="sub-cta"><button class="btn btn-primary" id="sub-founder-buy">Buy</button></div>`;
    }
    const seats = founder.owned
        ? `${esc(String(founder.taken))} of ${esc(String(founder.cap))} claimed`
        : soldOut
            ? `All ${esc(String(founder.cap))} claimed`
            : `${esc(String(founder.available))} of ${esc(String(founder.cap))} left`;
    return `<div class="sub-founder">
        <div class="sub-founder-card${founder.owned ? " current" : ""}">
            <img class="sub-founder-badge" src="/static/img/badge-${esc(founder.badge)}.svg" alt="" width="20" height="20">
            <div class="sub-founder-main">
                <div class="sub-tier-name">${esc(label)}</div>
                <p class="sub-founder-note">A one time purchase, limited to ${esc(String(founder.cap))} accounts.
                Carries the ${esc(label)} badge in chat forever, with no subscription and no renewal.</p>
                <div class="sub-founder-seats">${seats}</div>
            </div>
            <div class="sub-founder-side">
                <div class="sub-price">${price}</div>
                ${action}
            </div>
        </div>
    </div>`;
}

async function checkoutFounder(btn: HTMLButtonElement): Promise<void> {
    const generation = activationGeneration;
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/founder/checkout", { method: "POST" });
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
            void loadFounder(generation);
        }
        if (btn.isConnected && isCurrentActivation(generation)) btn.disabled = false;
    }
}

async function upgrade(btn: HTMLButtonElement): Promise<void> {
    const tier = btn.dataset["subUpgrade"];
    if (!tier) return;
    const label = cache?.tiers.find(t => t.key === tier)?.label ?? tier;
    if (!confirm(`Upgrade to ${label}? The prorated price difference for the current period is charged immediately.`)) return;
    const generation = activationGeneration;
    const revision = ++upgradeRevision;
    btn.disabled = true;
    try {
        const res = await authFetch<{ ok?: boolean; url?: string }>("/api/billing/upgrade", {
            method: "POST",
            body: JSON.stringify({ tier }),
        });
        if (res.url) {
            sessionStorage.setItem(PENDING_KEY, String(Date.now()));
            location.href = res.url;
            return;
        }
        const refresh = () => {
            if (!active) return;
            void loadTiers(activationGeneration);
        };
        refresh();
        window.setTimeout(refresh, 3000);
        window.setTimeout(refresh, 8000);
    } catch (e) {
        if (revision === upgradeRevision) {
            if (isCurrentActivation(generation)) {
                alert("Could not upgrade: " + (e instanceof Error ? e.message : String(e)));
            }
            if (btn.isConnected) btn.disabled = false;
        }
    }
}

async function checkout(btn: HTMLButtonElement): Promise<void> {
    const tier = btn.dataset["subTier"];
    if (!tier) return;
    const generation = activationGeneration;
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier }),
        });
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
        }
        if (btn.isConnected && isCurrentActivation(generation)) btn.disabled = false;
    }
}

async function checkoutPass(btn: HTMLButtonElement, tier: string | undefined): Promise<void> {
    if (!tier) return;
    const generation = activationGeneration;
    btn.disabled = true;
    try {
        const res = await authFetch<{ url: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier, pass: true }),
        });
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
        }
        if (btn.isConnected && isCurrentActivation(generation)) btn.disabled = false;
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
    window.addEventListener("subscription-changed", () => void loadTiers(activationGeneration));
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void loadTiers(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    loadRevision += 1;
    founderRevision += 1;
    stopPolling();
    pollStartedAt = 0;
}
