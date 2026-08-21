import { describe, expect, test } from "bun:test";
import {
    armHighlight,
    canAfford,
    MAX_REDEEM_TEXT,
    parseChipBalance,
    parseViewerRewards,
    promptsForText,
    redeemRequestBody,
    redeemText,
    type ViewerReward,
} from "../src/chat/redeem-wire.ts";

const highlight: ViewerReward = { id: 1, kind: "highlight", title: "Highlight my message", cost: 500, enabled: true, requiresText: true };
const custom: ViewerReward = { id: 7, kind: "custom", title: "Hydrate", cost: 100, enabled: true, requiresText: false };
const prompted: ViewerReward = { id: 8, kind: "custom", title: "Pick my color", cost: 250, enabled: true, requiresText: true };

describe("parseViewerRewards", () => {
    test("keeps valid rewards and normalizes unknown kinds to custom", () => {
        const rewards = parseViewerRewards({
            rewards: [
                { id: 1, kind: "highlight", title: "Highlight my message", cost: 500, enabled: true },
                { id: 7, kind: "weird", title: "Hydrate", cost: 100, enabled: true },
            ],
        });
        expect(rewards).toEqual([highlight, custom]);
    });

    test("reads requiresText and forces it on for the highlight reward", () => {
        const rewards = parseViewerRewards({
            rewards: [
                { id: 1, kind: "highlight", title: "Highlight my message", cost: 500, enabled: true, requiresText: false },
                { id: 8, kind: "custom", title: "Pick my color", cost: 250, enabled: true, requiresText: true },
                { id: 9, kind: "custom", title: "Hydrate", cost: 100, enabled: true, requiresText: "yes" },
            ],
        });
        expect(rewards.map(r => r.requiresText)).toEqual([true, true, false]);
    });

    test("drops malformed entries and disabled rewards", () => {
        const rewards = parseViewerRewards({
            rewards: [
                null,
                { id: "1", title: "x", cost: 5 },
                { id: 2, title: "", cost: 5 },
                { id: 3, title: "ok", cost: -1 },
                { id: 4, title: "off", cost: 5, enabled: false },
                { id: 5, title: "ok", cost: 5 },
            ],
        });
        expect(rewards).toEqual([{ id: 5, kind: "custom", title: "ok", cost: 5, enabled: true, requiresText: false }]);
    });

    test("returns an empty list for a payload without a rewards array", () => {
        expect(parseViewerRewards(null)).toEqual([]);
        expect(parseViewerRewards({})).toEqual([]);
        expect(parseViewerRewards({ rewards: "nope" })).toEqual([]);
    });
});

describe("armHighlight", () => {
    test("arms only for the highlight reward", () => {
        expect(armHighlight(highlight)).toEqual({ rewardId: 1, title: "Highlight my message", cost: 500 });
        expect(armHighlight(custom)).toBeNull();
    });
});

describe("redeemText", () => {
    test("trims and replaces newlines with spaces", () => {
        expect(redeemText("  hello\nworld  ")).toBe("hello world");
        expect(redeemText("a\r\nb")).toBe("a  b");
    });

    test("rejects empty and over long text", () => {
        expect(redeemText("")).toBeNull();
        expect(redeemText("   ")).toBeNull();
        expect(redeemText("a".repeat(MAX_REDEEM_TEXT + 1))).toBeNull();
        expect(redeemText("a".repeat(MAX_REDEEM_TEXT))).toBe("a".repeat(MAX_REDEEM_TEXT));
    });
});

describe("promptsForText", () => {
    test("prompts only for a custom reward that requires input", () => {
        expect(promptsForText(prompted)).toBe(true);
        expect(promptsForText(custom)).toBe(false);
    });

    test("never prompts for the highlight reward, which arms the composer instead", () => {
        expect(promptsForText(highlight)).toBe(false);
    });
});

describe("redeemRequestBody", () => {
    test("omits text for custom redemptions", () => {
        expect(JSON.parse(redeemRequestBody(7))).toEqual({ rewardId: 7 });
    });

    test("carries text for highlight redemptions", () => {
        expect(JSON.parse(redeemRequestBody(1, "hello"))).toEqual({ rewardId: 1, text: "hello" });
    });
});

describe("parseChipBalance", () => {
    test("reads plain and grouped numbers", () => {
        expect(parseChipBalance("1234")).toBe(1234);
        expect(parseChipBalance("1,234")).toBe(1234);
        expect(parseChipBalance("1.234")).toBe(1234);
        expect(parseChipBalance(" 12 345 ")).toBe(12345);
    });

    test("returns null for missing or non numeric text", () => {
        expect(parseChipBalance(null)).toBeNull();
        expect(parseChipBalance(undefined)).toBeNull();
        expect(parseChipBalance("")).toBeNull();
        expect(parseChipBalance("abc")).toBeNull();
        expect(parseChipBalance("12k")).toBeNull();
    });
});

describe("canAfford", () => {
    test("compares cost against a known balance", () => {
        expect(canAfford(100, 100)).toBe(true);
        expect(canAfford(101, 100)).toBe(false);
    });

    test("treats an unknown balance as affordable", () => {
        expect(canAfford(1000000, null)).toBe(true);
    });
});
