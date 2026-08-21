import { isOwner } from "./context.ts";
import { partners, roles, subscriberBadges, subscribers, unverified, vips } from "./members.ts";
import { attachBadgeUpsell } from "./badge-upsell.ts";

export type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "partner" | "regular" | "unverified";
export const BADGE_TITLE: Record<BadgeName, string> = {
    op: "Owner", staff: "Staff", bot: "Bot", mod: "Mod", vip: "VIP", partner: "Partner", regular: "Regular", unverified: "Unverified",
};

const SUBSCRIBER_BADGE_NAME_RE = /^[a-z0-9_]{1,24}$/;
export const NON_PURCHASABLE_BADGES = new Set(["ambassador", "bounty", "invite", "lucky", "medal", "partner", "streak_30", "streak_365", "twentyfour"]);

export function sanitizeSubscriberBadgeName(raw: string | undefined): string {
    if (raw && SUBSCRIBER_BADGE_NAME_RE.test(raw)) return raw;
    return "regular";
}

export function subscriberBadgeAssetPath(name: string): string {
    return `/static/img/badge-${name.replace(/_/g, "-")}.svg`;
}

export function subscriberBadgeTitle(name: string): string {
    if (name === "regular") return BADGE_TITLE.regular;
    if (name === "ambassador") return "Ambassador - one of the first";
    if (name === "bounty") return "Bug bounty - found a critical bug";
    if (name === "invite") return "Recruiter - invited a friend";
    if (name === "lucky") return "Lucky - one in a million";
    if (name === "partner") return "Partner";
    if (name === "streak_30") return "Every Day - 30 day visit streak";
    if (name === "streak_365") return "Full Orbit - 365 day visit streak";
    if (name === "twentyfour") return "Twenty-Four - streamed 24 hours straight";
    return name.split("_").filter(Boolean).map(w => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

export function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "live-chat-badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    img.title = BADGE_TITLE[name];
    img.loading = "lazy";
    return img;
}

export function makeSubscriberBadge(key: string): HTMLImageElement {
    const name = sanitizeSubscriberBadgeName(subscriberBadges.get(key));
    const img = document.createElement("img");
    img.className = "live-chat-badge";
    img.src = subscriberBadgeAssetPath(name);
    img.alt = "regular";
    img.title = subscriberBadgeTitle(name);
    img.loading = "lazy";
    if (name !== "regular") {
        img.addEventListener("error", () => {
            img.src = "/static/img/badge-regular.svg";
            img.alt = "regular";
            img.title = BADGE_TITLE.regular;
        }, { once: true });
    }
    if (!NON_PURCHASABLE_BADGES.has(name)) attachBadgeUpsell(img);
    return img;
}

export function buildBadges(from: string): HTMLImageElement[] {
    const key = from.toLowerCase();
    const role = roles.get(key);
    const badges: HTMLImageElement[] = [];
    if (role === "staff") badges.push(makeBadge("staff"));
    if (isOwner(from)) badges.push(makeBadge("op"));
    if (role === "bot") badges.push(makeBadge("bot"));
    if (role === "mod") badges.push(makeBadge("mod"));
    if (partners.has(key)) badges.push(makeBadge("partner"));
    if (vips.has(key)) badges.push(makeBadge("vip"));
    if (subscribers.has(key)) badges.push(makeSubscriberBadge(key));
    if (unverified.has(key)) badges.push(makeBadge("unverified"));
    return badges;
}
