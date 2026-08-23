import type { BillingAddon, BillingAddons, BillingCategory, BillingFounder, BillingTier, BillingTiers } from "../../api.ts";
import { amountText, perkDelta, perkLines, perkTokens } from "../../billing/catalog.ts";
import { esc, fmtDate } from "../format.ts";
import { authFetch } from "../session.ts";
import { wireStepper } from "../stepper.ts";

const CHANNEL_RETURN_RE = /^\/[A-Za-z0-9_-]{3,32}$/;

export function safeChannelReturnPath(raw: string | null | undefined): string | null {
    if (!raw) return null;
    return CHANNEL_RETURN_RE.test(raw) ? raw : null;
}

const PENDING_KEY = "sub-checkout-pending";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 120000;

let cache: BillingTiers | null = null;
let founderCache: BillingFounder | null = null;
let addonsCache: BillingAddons | null = null;
let addonsRevision = 0;
let addonActionKey: string | null = null;
let pollTimer: number | null = null;
let pollStartedAt = 0;
let activationGeneration = 0;
let loadRevision = 0;
let upgradeRevision = 0;
let founderRevision = 0;
let active = false;
let pendingUpgradeTier: string | null = null;
const UPGRADE_CONFIRM_DELAYS_MS = [3000, 8000, 15000];

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function featuredTierKey(tiers: BillingTier[]): string | null {
    const configured = (cache?.featuredTier ?? "").trim();
    if (!configured) return null;
    if (configured.toLowerCase() === "first") return tiers[0]?.key ?? null;
    return tiers.some(t => t.key === configured) ? configured : null;
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
    void loadAddons(generation);
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

async function loadAddons(generation: number): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const revision = ++addonsRevision;
    let loaded: BillingAddons;
    try {
        loaded = await authFetch<BillingAddons>("/api/billing/addons");
    } catch {
        return;
    }
    if (!isCurrentActivation(generation) || revision !== addonsRevision) return;
    addonsCache = loaded;
    render();
}

function amountHtml(rawPrice: string, currency: string): string {
    return esc(amountText(rawPrice, currency));
}

function priceHtml(rawPrice: string): string {
    const amount = amountText(rawPrice, cache?.currency ?? "");
    if (!amount) return "";
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
    const delta = perkDelta(index, tokenLists, tiers);
    const shown = delta.shown;
    const inherit = delta.inheritFrom === null
        ? ""
        : `<p class="sub-inherit">Everything in ${esc(delta.inheritFrom)}${shown.length ? ", plus:" : ""}</p>`;
    const perksHtml = shown.length
        ? `<ul class="sub-perks">${shown.flatMap(t => perkLines(t)).map(line => `<li>${esc(line)}</li>`).join("")}</ul>`
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
        action = pendingUpgradeTier === tier.key
            ? `<div class="sub-current-label" style="color:var(--muted)">Upgrade submitted, confirming...</div>`
            : `<div class="sub-cta"><button class="btn btn-primary" data-sub-upgrade="${esc(tier.key)}">Upgrade</button></div>${passCtaHtml(tier)}`;
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
    const backPath = safeChannelReturnPath(new URLSearchParams(location.search).get("return"));
    const backLink = backPath
        ? `<a class="sub-back-link" href="${esc(backPath)}">&larr; Back to ${esc(backPath.slice(1))}</a>`
        : "";
    const head = `<p class="sub-head">Support the site and unlock extra features for chat, your profile and your stream. Cancel anytime, perks stay until the end of the paid period.</p>`;
    const pendingBanner = !activePlan && pendingCheckout()
        ? `<div class="sub-pending">Waiting for the payment provider to confirm your subscription. This usually takes a few seconds. If you cancelled the checkout, ignore this message.</div>`
        : "";
    const portalButtons = portalButtonsHtml();
    const tierLabel = current ? cache.tiers.find(t => t.key === current.tier)?.label ?? current.tier : "";
    const statusBlock = activePlan
        ? `<div class="sub-status">
            <b>${esc(tierLabel)}</b>
            <span>${esc(isPassHeld ? "Pass" : current!.status)}</span>
            <span>${isPassHeld ? "Pass active until " + esc(renewalDate) : "Renews " + esc(renewalDate)}</span>
            ${portalButtons}
            ${portalButtons ? `<span>Downgrades and cancellation are handled there.</span>` : ""}
        </div>`
        : "";
    const tiers = [...cache.tiers].sort((a, b) => a.rank - b.rank);
    const tokenLists = tiers.map(t => perkTokens(t.perks));
    const grid = tiers.length
        ? `<div class="sub-grid">${tiers.map((t, i) => tierCard(t, i, tiers, tokenLists)).join("")}</div>`
        : `<p style="color:var(--muted);font-size:13px;margin:0">No plans configured.</p>`;
    const feeNote = cache.feeNote ? `<p class="sub-fee">${esc(cache.feeNote)}</p>` : "";
    el.innerHTML = backLink + head + pendingBanner + statusBlock + grid + founderCardHtml() + addonsSectionHtml() + feeNote;
    el.querySelectorAll<HTMLInputElement>("[id^='sub-addon-qty-']").forEach(input => wireStepper(input));
    el.querySelectorAll<HTMLButtonElement>("[data-sub-addon-get]").forEach(btn => {
        btn.addEventListener("click", () => void getAddon(btn.dataset["subAddonGet"]!));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-sub-addon-upgrade]").forEach(btn => {
        btn.addEventListener("click", () => void upgradeAddon(btn.dataset["subAddonUpgrade"]!));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-sub-addon-qty-submit]").forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset["subAddonQtySubmit"]!;
            const input = document.getElementById(`sub-addon-qty-${key}`) as HTMLInputElement | null;
            const quantity = Math.round(Number(input?.value ?? "1"));
            if (!Number.isFinite(quantity) || quantity < 1) return;
            const addon = addonsCache?.addons.find(a => a.key === key);
            if (addon?.active) void changeAddonQuantity(key, quantity);
            else void getAddon(key, quantity);
        });
    });
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

function groupAddonsByCategory(addons: BillingAddon[], categories: BillingCategory[]): { label: string | null; addons: BillingAddon[] }[] {
    const labelById = new Map(categories.map(c => [c.id, c.label]));
    const groups = new Map<string, BillingAddon[]>();
    const order: string[] = [];
    for (const addon of addons) {
        const key = addon.category ?? "";
        if (!groups.has(key)) {
            groups.set(key, []);
            order.push(key);
        }
        groups.get(key)!.push(addon);
    }
    return order.map(key => ({ label: key ? labelById.get(key) ?? key : null, addons: groups.get(key)! }));
}

function addonCardHtml(addon: BillingAddon): string {
    const price = amountHtml(addon.price, addonsCache?.currency ?? cache?.currency ?? "");
    const interval = (addonsCache?.priceInterval ?? cache?.priceInterval ?? "").trim();
    const note = addon.note ? `<p class="sub-addon-note">${esc(addon.note)}</p>` : "";
    const busy = addonActionKey === addon.key;
    let action: string;
    if (addon.quantityAddon) {
        const max = addon.maxQuantity ?? 16;
        const current = addon.active ? Math.max(1, addon.quantity ?? 1) : 1;
        action = `
            <div class="sub-addon-qty">
                <span>Amount</span>
                <div class="stepper">
                    <button type="button" class="stepper-btn" data-step="-1" aria-label="Decrease">&minus;</button>
                    <input type="number" min="1" max="${max}" step="1" value="${current}" id="sub-addon-qty-${esc(addon.key)}" ${busy ? "disabled" : ""} />
                    <button type="button" class="stepper-btn" data-step="1" aria-label="Increase">+</button>
                </div>
            </div>
            <div class="sub-cta"><button class="btn btn-primary" data-sub-addon-qty-submit="${esc(addon.key)}" ${busy ? "disabled" : ""}>${addon.active ? "Update amount" : "Get this"}</button></div>`;
    } else if (addon.active) {
        action = `<div class="sub-current-label">Active</div>`;
    } else if (addon.upgrade) {
        action = `<div class="sub-cta"><button class="btn btn-primary" data-sub-addon-upgrade="${esc(addon.key)}" ${busy ? "disabled" : ""}>Upgrade to this</button></div>`;
    } else if (addon.downgrade) {
        action = `<div class="sub-current-label" style="color:var(--muted)">You have a higher tier of this already</div>`;
    } else {
        action = `<div class="sub-cta"><button class="btn btn-primary" data-sub-addon-get="${esc(addon.key)}" ${busy ? "disabled" : ""}>Get this</button></div>`;
    }
    return `<div class="sub-card${addon.active ? " current" : ""}">
        <div class="sub-tier-name">${esc(addon.label)}</div>
        <div class="sub-price">${price}${interval ? ` <span class="sub-interval">/ ${esc(interval)}</span>` : ""}</div>
        ${note}
        ${action}
    </div>`;
}

function addonsSectionHtml(): string {
    const addons = addonsCache?.addons ?? [];
    if (!addonsCache?.enabled || !addons.length) return "";
    const groups = groupAddonsByCategory(addons, addonsCache.categories ?? []);
    const body = groups.map(group => {
        const heading = group.label ? `<div class="sub-addon-group-title">${esc(group.label)}</div>` : "";
        return `${heading}<div class="sub-grid">${group.addons.map(addonCardHtml).join("")}</div>`;
    }).join("");
    return `<div class="sub-addons-section">
        <div class="section-title">Add-ons</div>
        <div class="sub-addon-groups">${body}</div>
    </div>`;
}

async function getAddon(key: string, quantity?: number): Promise<void> {
    const generation = activationGeneration;
    addonActionKey = key;
    render();
    try {
        const body: Record<string, unknown> = { addon: key };
        if (quantity !== undefined) body["quantity"] = quantity;
        const res = await authFetch<{ url?: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify(body),
        });
        if (!res.url) throw new Error("The server did not return a payment link.");
        sessionStorage.setItem(PENDING_KEY, String(Date.now()));
        location.href = res.url;
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
        }
    } finally {
        if (isCurrentActivation(generation)) {
            addonActionKey = null;
            render();
        }
    }
}

async function changeAddonQuantity(key: string, quantity: number): Promise<void> {
    const generation = activationGeneration;
    addonActionKey = key;
    render();
    try {
        await authFetch("/api/billing/upgrade", {
            method: "POST",
            body: JSON.stringify({ addon: key, quantity }),
        });
        await loadAddons(generation);
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not change the amount: " + (e instanceof Error ? e.message : String(e)));
        }
    } finally {
        if (isCurrentActivation(generation)) {
            addonActionKey = null;
            render();
        }
    }
}

async function upgradeAddon(key: string): Promise<void> {
    const generation = activationGeneration;
    addonActionKey = key;
    render();
    try {
        const res = await authFetch<{ ok?: boolean; url?: string }>("/api/billing/upgrade", {
            method: "POST",
            body: JSON.stringify({ addon: key }),
        });
        if (res.url) {
            sessionStorage.setItem(PENDING_KEY, String(Date.now()));
            location.href = res.url;
            return;
        }
        await loadAddons(generation);
    } catch (e) {
        if (isCurrentActivation(generation)) {
            alert("Could not upgrade: " + (e instanceof Error ? e.message : String(e)));
        }
    } finally {
        if (isCurrentActivation(generation)) {
            addonActionKey = null;
            render();
        }
    }
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
        const res = await authFetch<{ url?: string }>("/api/billing/founder/checkout", { method: "POST" });
        if (!res.url) throw new Error("The server did not return a payment link.");
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
        pendingUpgradeTier = tier;
        render();
        for (const delay of UPGRADE_CONFIRM_DELAYS_MS) {
            await new Promise<void>(resolve => window.setTimeout(resolve, delay));
            if (!isCurrentActivation(generation) || revision !== upgradeRevision || pendingUpgradeTier !== tier) return;
            await loadTiers(activationGeneration);
            if (!isCurrentActivation(generation) || revision !== upgradeRevision || pendingUpgradeTier !== tier) return;
            if (cache?.current?.tier === tier) {
                pendingUpgradeTier = null;
                render();
                return;
            }
        }
        if (pendingUpgradeTier === tier) {
            pendingUpgradeTier = null;
            render();
        }
    } catch (e) {
        if (revision === upgradeRevision) {
            if (pendingUpgradeTier === tier) pendingUpgradeTier = null;
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
        const res = await authFetch<{ url?: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier }),
        });
        if (!res.url) throw new Error("The server did not return a payment link.");
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
        const res = await authFetch<{ url?: string }>("/api/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ tier, pass: true }),
        });
        if (!res.url) throw new Error("The server did not return a payment link.");
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
        const res = await authFetch<{ url?: string }>("/api/billing/portal", {
            method: "POST",
            body: provider ? JSON.stringify({ provider }) : undefined,
        });
        if (!res.url) throw new Error("The server did not return a portal link.");
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
    upgradeRevision += 1;
    founderRevision += 1;
    addonsRevision += 1;
    addonActionKey = null;
    pendingUpgradeTier = null;
    stopPolling();
    pollStartedAt = 0;
}
