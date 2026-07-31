import { isOwner } from "./context.ts";
import { roles, subscribers, unverified, vips } from "./members.ts";

export type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "regular" | "unverified";
export const BADGE_TITLE: Record<BadgeName, string> = {
    op: "Owner", staff: "Staff", bot: "Bot", mod: "Mod", vip: "VIP", regular: "Regular", unverified: "Unverified",
};

export function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "live-chat-badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    img.title = BADGE_TITLE[name];
    img.loading = "lazy";
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
    if (vips.has(key)) badges.push(makeBadge("vip"));
    if (subscribers.has(key)) badges.push(makeBadge("regular"));
    if (unverified.has(key)) badges.push(makeBadge("unverified"));
    return badges;
}
