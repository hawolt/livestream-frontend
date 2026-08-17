import { describe, expect, test } from "bun:test";
import type { BillingTier } from "../src/api.ts";
import { amountText, perkDelta, perkLines, perkTokens } from "../src/billing/catalog.ts";
import { featuredTierKey, sortedTiers, subscriptionCtaHref } from "../src/pricing/view.ts";

function tier(key: string, label: string, rank: number, order: string[]): BillingTier {
    return {
        key,
        label,
        price: "5",
        rank,
        perks: {
            badge: order.includes("badge"),
            chatColor: order.includes("chat_color"),
            adsOff: order.includes("ads_off"),
            largeUploads: order.includes("large_uploads"),
            animatedAvatar: order.includes("animated_avatar"),
            order,
        },
    };
}

describe("amountText", () => {
    test("appends a known currency symbol to a numeric price", () => {
        expect(amountText("4.99", "EUR")).toBe("4.99 €");
        expect(amountText("5", "usd")).toBe("5 $");
    });

    test("falls back to the raw currency code", () => {
        expect(amountText("5", "SEK")).toBe("5 SEK");
    });

    test("leaves a non numeric price untouched", () => {
        expect(amountText("free", "EUR")).toBe("free");
    });

    test("is empty for a blank price", () => {
        expect(amountText("  ", "EUR")).toBe("");
    });
});

describe("perkTokens", () => {
    test("prefers the configured order", () => {
        const perks = tier("a", "A", 1, ["badge_king", "watch_4k", "chat_color"]).perks;
        expect(perkTokens(perks)).toEqual(["badge_king", "watch_4k", "chat_color"]);
    });

    test("drops tokens with no viewer facing meaning", () => {
        const perks = tier("a", "A", 1, ["chat_color", "restream", "transcode"]).perks;
        expect(perkTokens(perks)).toEqual(["chat_color"]);
    });

    test("falls back to the boolean fields with no order", () => {
        expect(perkTokens({ badge: true, chatColor: false, adsOff: true, largeUploads: false, animatedAvatar: false }))
            .toEqual(["badge", "ads_off"]);
    });

    test("is empty for missing perks", () => {
        expect(perkTokens(undefined)).toEqual([]);
    });
});

describe("perkLines", () => {
    test("expands a watch perk into several lines", () => {
        expect(perkLines("watch_4k")).toEqual(["Watch up to 240 FPS", "Watch in 4K"]);
    });

    test("titles a named badge", () => {
        expect(perkLines("badge_king")).toEqual(["Exclusive King badge"]);
        expect(perkLines("badge_vip")).toEqual(["Exclusive VIP badge"]);
    });

    test("passes an unknown token through", () => {
        expect(perkLines("mystery")).toEqual(["mystery"]);
    });
});

describe("perkDelta", () => {
    const tiers = [
        tier("regular", "Regular", 1, ["badge", "chat_color"]),
        tier("baron", "Baron", 2, ["badge_baron", "chat_color", "watch_2k"]),
        tier("king", "King", 3, ["badge_king", "chat_color", "watch_4k"]),
    ];
    const tokenLists = tiers.map(t => perkTokens(t.perks));

    test("the first tier shows everything", () => {
        expect(perkDelta(0, tokenLists, tiers)).toEqual({ inheritFrom: null, shown: ["badge", "chat_color"] });
    });

    test("a covering tier only shows what it adds", () => {
        expect(perkDelta(1, tokenLists, tiers)).toEqual({ inheritFrom: "Regular", shown: ["badge_baron", "watch_2k"] });
    });

    test("watch_4k covers watch_2k", () => {
        expect(perkDelta(2, tokenLists, tiers)).toEqual({ inheritFrom: "Baron", shown: ["badge_king", "watch_4k"] });
    });

    test("a tier that drops a perk shows its full list", () => {
        const gappy = [
            tier("a", "A", 1, ["badge", "chat_color", "ads_off"]),
            tier("b", "B", 2, ["badge"]),
        ];
        const lists = gappy.map(t => perkTokens(t.perks));
        expect(perkDelta(1, lists, gappy)).toEqual({ inheritFrom: null, shown: ["badge"] });
    });
});

describe("pricing view helpers", () => {
    test("sorts tiers by rank without mutating the input", () => {
        const input = [tier("b", "B", 2, []), tier("a", "A", 1, [])];
        expect(sortedTiers(input).map(t => t.key)).toEqual(["a", "b"]);
        expect(input.map(t => t.key)).toEqual(["b", "a"]);
    });

    test("resolves the featured tier key", () => {
        const tiers = [tier("a", "A", 1, []), tier("b", "B", 2, [])];
        expect(featuredTierKey("b", tiers)).toBe("b");
        expect(featuredTierKey("first", tiers)).toBe("a");
        expect(featuredTierKey("missing", tiers)).toBeNull();
        expect(featuredTierKey(undefined, tiers)).toBeNull();
    });

    test("sends a signed out visitor through registration", () => {
        expect(subscriptionCtaHref(false)).toBe("/register?return=%2Fdashboard%2Fsubscription");
        expect(subscriptionCtaHref(true)).toBe("/dashboard/subscription");
    });
});
