import { describe, expect, test } from "bun:test";
import {
    NON_PURCHASABLE_BADGES,
    sanitizeSubscriberBadgeName,
    subscriberBadgeAssetPath,
    subscriberBadgeTitle,
} from "../src/chat/badges.ts";

describe("subscriberBadgeTitle", () => {
    test("names the twentyfour badge with its flavour line", () => {
        expect(subscriberBadgeTitle("twentyfour")).toBe("Twenty-Four - streamed 24 hours straight");
    });

    test("keeps the existing earned badge titles", () => {
        expect(subscriberBadgeTitle("regular")).toBe("Regular");
        expect(subscriberBadgeTitle("ambassador")).toBe("Ambassador - one of the first");
        expect(subscriberBadgeTitle("lucky")).toBe("Lucky - one in a million");
    });

    test("names the streak badges as the badge guide does", () => {
        expect(subscriberBadgeTitle("streak_30")).toBe("Every Day - 30 day visit streak");
        expect(subscriberBadgeTitle("streak_365")).toBe("Full Orbit - 365 day visit streak");
    });

    test("falls back to a title cased wire name", () => {
        expect(subscriberBadgeTitle("unknown_badge")).toBe("Unknown Badge");
    });
});

describe("NON_PURCHASABLE_BADGES", () => {
    test("covers every badge that cannot be bought", () => {
        for (const name of ["ambassador", "bounty", "invite", "lucky", "medal", "partner", "streak_30", "streak_365", "twentyfour"]) {
            expect(NON_PURCHASABLE_BADGES.has(name)).toBe(true);
        }
    });

    test("leaves the purchasable tier badges out", () => {
        expect(NON_PURCHASABLE_BADGES.has("regular")).toBe(false);
        expect(NON_PURCHASABLE_BADGES.has("baron")).toBe(false);
        expect(NON_PURCHASABLE_BADGES.has("king")).toBe(false);
    });
});

describe("twentyfour badge wire name", () => {
    test("survives sanitizing and resolves to its asset", () => {
        expect(sanitizeSubscriberBadgeName("twentyfour")).toBe("twentyfour");
        expect(subscriberBadgeAssetPath("twentyfour")).toBe("/static/img/badge-twentyfour.svg");
    });
});
