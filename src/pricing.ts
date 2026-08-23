import type { BillingAddonOption, BillingCatalog, BillingCatalogFounder, BillingCategory, BillingTier } from "./api.ts";
import { amountText, perkDelta, perkLines, perkTokens } from "./billing/catalog.ts";
import { initSiteNav, type SessionInfo } from "./nav.ts";
import { API_BASE } from "./api.ts";
import { subscriptionCtaHref, featuredTierKey, sortedTiers } from "./pricing/view.ts";

const tiersEl = document.getElementById("pricing-tiers") as HTMLElement;
const addonsEl = document.getElementById("pricing-addons") as HTMLElement;
const addonsSectionEl = document.getElementById("pricing-addons-section") as HTMLElement;
const founderEl = document.getElementById("pricing-founder") as HTMLElement;
const founderSectionEl = document.getElementById("pricing-founder-section") as HTMLElement;
const feeNoteEl = document.getElementById("pricing-fee-note") as HTMLElement;

let signedIn = false;

function element(tag: string, className?: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function priceBlock(price: string, currency: string, interval: string): HTMLElement {
    const wrap = element("div", "pricing-price");
    const amount = amountText(price, currency);
    if (!amount) return wrap;
    wrap.textContent = amount;
    const trimmed = interval.trim();
    if (trimmed) wrap.append(element("span", "pricing-interval", ` / ${trimmed}`));
    return wrap;
}

function ctaLink(label: string): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = "btn btn-primary";
    link.href = subscriptionCtaHref(signedIn);
    link.textContent = label;
    return link;
}

function tierCard(tier: BillingTier, index: number, tiers: BillingTier[], tokenLists: string[][],
                   catalog: BillingCatalog): HTMLElement {
    const featured = tier.key === featuredTierKey(catalog.featuredTier, tiers);
    const card = element("div", featured ? "pricing-card featured" : "pricing-card");
    if (featured) card.append(element("span", "pricing-flag", "BEST DEAL"));
    card.append(element("div", "pricing-tier-name", tier.label));
    card.append(priceBlock(tier.price, catalog.currency ?? "", catalog.priceInterval ?? ""));

    const delta = perkDelta(index, tokenLists, tiers);
    if (delta.inheritFrom !== null) {
        card.append(element("p", "pricing-inherit",
            `Everything in ${delta.inheritFrom}${delta.shown.length ? ", plus:" : ""}`));
    }
    if (delta.shown.length) {
        const list = element("ul", "pricing-perks");
        for (const line of delta.shown.flatMap(token => perkLines(token))) {
            list.append(element("li", undefined, line));
        }
        card.append(list);
    }

    const cta = element("div", "pricing-cta");
    cta.append(ctaLink("Subscribe"));
    card.append(cta);
    if (tier.passAvailable) {
        const days = catalog.passDays ?? 30;
        const price = tier.passPrice ? ` for ${amountText(tier.passPrice, catalog.currency ?? "")}` : "";
        card.append(element("div", "pricing-pass", `Also available as a ${days} day pass${price}`));
    }
    return card;
}

function addonCard(addon: BillingAddonOption, catalog: BillingCatalog): HTMLElement {
    const card = element("div", "pricing-card");
    card.append(element("div", "pricing-tier-name", addon.label));
    card.append(priceBlock(addon.price, catalog.currency ?? "", catalog.priceInterval ?? ""));
    if (addon.note) card.append(element("p", "pricing-addon-note", addon.note));
    if (addon.quantityAddon && addon.maxQuantity) {
        card.append(element("p", "pricing-addon-note", `Stackable up to ${addon.maxQuantity} times.`));
    }
    const cta = element("div", "pricing-cta");
    cta.append(ctaLink("Get this"));
    card.append(cta);
    if (addon.passAvailable) {
        const days = catalog.passDays ?? 30;
        const price = addon.passPrice ? ` for ${amountText(addon.passPrice, catalog.currency ?? "")}` : "";
        card.append(element("div", "pricing-pass", `Also available as a ${days} day pass${price}`));
    }
    return card;
}

function groupByCategory(addons: BillingAddonOption[], categories: BillingCategory[]): { label: string | null; addons: BillingAddonOption[] }[] {
    const labelById = new Map(categories.map(c => [c.id, c.label]));
    const groups = new Map<string, BillingAddonOption[]>();
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

function founderCard(founder: BillingCatalogFounder, catalog: BillingCatalog): HTMLElement {
    const card = element("div", "pricing-card featured");
    card.append(element("div", "pricing-tier-name", founder.label || "Founder"));
    const price = element("div", "pricing-price");
    price.textContent = amountText(founder.price, catalog.currency ?? "");
    price.append(element("span", "pricing-interval", " one time"));
    card.append(price);
    card.append(element("p", "pricing-addon-note",
        "A permanent badge and a permanent place on the founder list. Not a subscription, nothing renews."));
    const soldOut = founder.available <= 0;
    card.append(element("div", "pricing-founder-seats", soldOut
        ? `Sold out, all ${founder.cap} seats taken`
        : `${founder.available} of ${founder.cap} seats left`));
    if (!soldOut) {
        const cta = element("div", "pricing-cta");
        cta.append(ctaLink("Claim a seat"));
        card.append(cta);
    }
    return card;
}

function offerJsonLd(catalog: BillingCatalog): void {
    const tiers = sortedTiers(catalog.tiers);
    if (!tiers.length || !catalog.currency) return;
    const offers = tiers
        .filter(tier => /^[\d.,\s]+$/.test(tier.price.trim()))
        .map(tier => ({
            "@type": "Offer",
            "name": tier.label,
            "price": tier.price.trim().replace(",", "."),
            "priceCurrency": catalog.currency,
            "url": `${location.origin}/pricing`,
            "availability": "https://schema.org/InStock",
        }));
    if (!offers.length) return;
    const payload = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": "ITZON subscription",
        "serviceType": "Live streaming subscription",
        "provider": { "@type": "Organization", "name": "ITZON", "url": `${location.origin}/` },
        "areaServed": "Worldwide",
        "offers": offers,
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(payload);
    document.head.append(script);
}

function renderCatalog(catalog: BillingCatalog): void {
    if (!catalog.enabled || !catalog.tiers.length) {
        tiersEl.textContent = "Subscriptions are not available right now.";
        return;
    }
    const tiers = sortedTiers(catalog.tiers);
    const tokenLists = tiers.map(tier => perkTokens(tier.perks));
    const grid = element("div", "pricing-grid");
    tiers.forEach((tier, index) => grid.append(tierCard(tier, index, tiers, tokenLists, catalog)));
    tiersEl.className = "";
    tiersEl.replaceChildren(grid);

    const founder = catalog.founder;
    if (founder && founder.enabled) {
        founderEl.replaceChildren(founderCard(founder, catalog));
        founderSectionEl.hidden = false;
    }

    const addons = catalog.addons ?? [];
    if (addons.length) {
        const wrap = element("div", "pricing-addon-groups");
        for (const group of groupByCategory(addons, catalog.categories ?? [])) {
            if (group.label) wrap.append(element("h3", "pricing-addon-group-title", group.label));
            const addonGrid = element("div", "pricing-grid");
            for (const addon of group.addons) addonGrid.append(addonCard(addon, catalog));
            wrap.append(addonGrid);
        }
        addonsEl.replaceChildren(wrap);
        addonsSectionEl.hidden = false;
    }

    if (catalog.feeNote) {
        feeNoteEl.textContent = catalog.feeNote;
        feeNoteEl.hidden = false;
    }
    offerJsonLd(catalog);
}

async function loadSession(): Promise<SessionInfo | null> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (!res.ok) return null;
        return await res.json() as SessionInfo;
    } catch {
        return null;
    }
}

async function boot(): Promise<void> {
    const session = await loadSession();
    signedIn = !!session && session.kind === "user" && typeof session.username === "string";
    void initSiteNav(null, [], session);
    try {
        const res = await fetch("/api/live/billing/catalog");
        if (!res.ok) throw new Error("catalog unavailable");
        renderCatalog(await res.json() as BillingCatalog);
    } catch {
        tiersEl.textContent = "Could not load the plans right now. Try refreshing the page.";
    }
}

void boot();

export {};
