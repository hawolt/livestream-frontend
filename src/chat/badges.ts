import { isOwner } from "./context.ts";
import { partners, roles, subscriberBadges, subscribers, unverified, vips, type Role } from "./members.ts";
import { attachBadgeUpsell } from "./badge-upsell.ts";
import type { BadgeRole } from "./irc.ts";

export type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "partner" | "regular" | "unverified";

export interface BadgeSnapshot {
    role?: BadgeRole;
    vip?: boolean;
    partner?: boolean;
    subBadge?: string;
    unverified?: boolean;
}

export interface ResolvedBadges {
    role?: Role;
    owner: boolean;
    vip: boolean;
    partner: boolean;
    subBadgeName?: string;
    unverified: boolean;
}
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

function makeSubscriberBadgeForName(rawName: string): HTMLImageElement {
    const name = sanitizeSubscriberBadgeName(rawName);
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

export function makeSubscriberBadge(key: string): HTMLImageElement {
    return makeSubscriberBadgeForName(subscriberBadges.get(key) ?? "");
}

function hasRoleSnapshot(snapshot: BadgeSnapshot | undefined): boolean {
    return snapshot !== undefined && (snapshot.role !== undefined || snapshot.vip === true || snapshot.unverified === true);
}

export function resolveBadges(from: string, snapshot?: BadgeSnapshot): ResolvedBadges {
    const key = from.toLowerCase();
    const roleAware = hasRoleSnapshot(snapshot);
    const subBadge = snapshot?.subBadge;
    return {
        role: roleAware ? snapshot!.role : roles.get(key),
        owner: isOwner(from),
        vip: roleAware ? snapshot!.vip === true : vips.has(key),
        partner: snapshot?.partner ?? partners.has(key),
        subBadgeName: subBadge !== undefined
            ? sanitizeSubscriberBadgeName(subBadge)
            : (subscribers.has(key) ? sanitizeSubscriberBadgeName(subscriberBadges.get(key)) : undefined),
        unverified: roleAware ? snapshot!.unverified === true : unverified.has(key),
    };
}

export function renderBadges(resolved: ResolvedBadges): HTMLImageElement[] {
    const badges: HTMLImageElement[] = [];
    if (resolved.role === "staff") badges.push(makeBadge("staff"));
    if (resolved.owner) badges.push(makeBadge("op"));
    if (resolved.role === "bot") badges.push(makeBadge("bot"));
    if (resolved.role === "mod") badges.push(makeBadge("mod"));
    if (resolved.partner) badges.push(makeBadge("partner"));
    if (resolved.vip) badges.push(makeBadge("vip"));
    if (resolved.subBadgeName !== undefined) badges.push(makeSubscriberBadgeForName(resolved.subBadgeName));
    if (resolved.unverified) badges.push(makeBadge("unverified"));
    return badges;
}

export function buildBadges(from: string): HTMLImageElement[] {
    return renderBadges(resolveBadges(from));
}
