import type { BillingPerks, BillingTier } from "../api.ts";

export const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
};

export function amountText(rawPrice: string, currency: string): string {
    const price = (rawPrice ?? "").trim();
    if (!price) return "";
    const configured = (currency ?? "").trim();
    const symbol = configured ? CURRENCY_SYMBOLS[configured.toUpperCase()] ?? configured : "";
    return symbol && /^[\d.,\s]+$/.test(price) ? `${price} ${symbol}` : price;
}

export const PERK_FIELD: Record<string, keyof BillingPerks> = {
    badge: "badge",
    chat_color: "chatColor",
    ads_off: "adsOff",
    large_uploads: "largeUploads",
    animated_avatar: "animatedAvatar",
};

export const FALLBACK_PERK_ORDER = [
    "badge", "chat_color", "ads_off", "large_uploads", "animated_avatar",
];

const WATCH_PERK_LINES: Record<string, string[]> = {
    watch_2k: ["Watch up to 120 FPS", "Watch in 2K"],
    watch_4k: ["Watch up to 240 FPS", "Watch in 4K"],
    watch_ll: ["Extra low latency streaming"],
};

function badgeTitle(token: string): string {
    return token.slice("badge_".length).split("_")
        .map(word => word === "vip" ? "VIP" : word ? word[0]!.toUpperCase() + word.slice(1) : word)
        .join(" ");
}

export function perkLabel(token: string): string {
    switch (token) {
        case "badge": return "Regular badge in chat";
        case "chat_color": return "Custom chat name color";
        case "ads_off": return "No ads";
        case "large_uploads": return "Profile images up to 1 MiB";
        case "animated_avatar": return "Animated GIF profile images";
        case "watch_ll": return "Extra low latency";
        default:
            return token.startsWith("badge_") ? `Exclusive ${badgeTitle(token)} badge` : token;
    }
}

export function perkLines(token: string): string[] {
    const watch = WATCH_PERK_LINES[token];
    return watch ? watch : [perkLabel(token)];
}

export function perkTokens(perks: BillingPerks | undefined): string[] {
    if (!perks) return [];
    if (Array.isArray(perks.order) && perks.order.length) {
        return perks.order.filter(t => PERK_FIELD[t] !== undefined || t.startsWith("badge_") || WATCH_PERK_LINES[t] !== undefined);
    }
    return FALLBACK_PERK_ORDER.filter(t => perks[PERK_FIELD[t]!] === true);
}

export interface PerkDelta {
    inheritFrom: string | null;
    shown: string[];
}

export function perkDelta(index: number, tokenLists: string[][], tiers: BillingTier[]): PerkDelta {
    const tokens = tokenLists[index] ?? [];
    if (index <= 0) return { inheritFrom: null, shown: tokens };
    const previous = tokenLists[index - 1] ?? [];
    if (!previous.length) return { inheritFrom: null, shown: tokens };
    const covers = (token: string): boolean =>
        tokens.includes(token)
        || (token === "badge" && tokens.some(x => x.startsWith("badge_")))
        || (token.startsWith("badge_") && tokens.some(x => x.startsWith("badge_")))
        || (token === "watch_2k" && tokens.includes("watch_4k"));
    if (!previous.every(covers)) return { inheritFrom: null, shown: tokens };
    const previousSet = new Set(previous);
    return {
        inheritFrom: tiers[index - 1]?.label ?? null,
        shown: tokens.filter(t => !previousSet.has(t)),
    };
}
