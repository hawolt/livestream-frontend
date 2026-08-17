import type { BillingTier } from "../api.ts";

export const SUBSCRIPTION_PATH = "/dashboard/subscription";

export function subscriptionCtaHref(signedIn: boolean): string {
    if (signedIn) return SUBSCRIPTION_PATH;
    return `/register?return=${encodeURIComponent(SUBSCRIPTION_PATH)}`;
}

export function sortedTiers(tiers: BillingTier[]): BillingTier[] {
    return [...tiers].sort((a, b) => a.rank - b.rank);
}

export function featuredTierKey(configured: string | undefined, tiers: BillingTier[]): string | null {
    const value = (configured ?? "").trim();
    if (!value) return null;
    if (value.toLowerCase() === "first") return tiers[0]?.key ?? null;
    return tiers.some(tier => tier.key === value) ? value : null;
}
