import { beforeEach, describe, expect, test } from "bun:test";
import {
    NON_PURCHASABLE_BADGES,
    resolveBadges,
    renderBadges,
    sanitizeSubscriberBadgeName,
    subscriberBadgeAssetPath,
    subscriberBadgeTitle,
    type BadgeSnapshot,
} from "../src/chat/badges.ts";
import { ctx } from "../src/chat/context.ts";
import { partners, roles, subscriberBadges, subscribers, unverified, vips } from "../src/chat/members.ts";

class StubElement {
    tagName: string;
    className = "";
    src = "";
    alt = "";
    title = "";
    loading = "";
    private listeners = new Map<string, ((this: StubElement) => void)[]>();

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    addEventListener(type: string, fn: (this: StubElement) => void): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    fire(type: string): void {
        for (const fn of this.listeners.get(type) ?? []) fn.call(this);
    }
}

const stubBody = { classList: { contains: () => false } };
(globalThis as unknown as { document: unknown }).document = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    body: stubBody,
};

function resetLiveState(): void {
    roles.clear();
    vips.clear();
    partners.clear();
    subscribers.clear();
    subscriberBadges.clear();
    unverified.clear();
    ctx.channel = "#alice";
}

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

describe("resolveBadges", () => {
    beforeEach(resetLiveState);

    test("falls back to live maps when a record has no snapshot tags", () => {
        roles.set("modu", "mod");
        vips.add("modu");
        unverified.add("modu");
        partners.add("modu");
        subscribers.add("modu");
        subscriberBadges.set("modu", "lucky");
        expect(resolveBadges("modu")).toEqual({
            role: "mod",
            owner: false,
            vip: true,
            partner: true,
            subBadgeName: "lucky",
            unverified: true,
        });
    });

    test("an absent sender with no live state and no snapshot renders nothing", () => {
        expect(resolveBadges("ghost")).toEqual({
            role: undefined,
            owner: false,
            vip: false,
            partner: false,
            subBadgeName: undefined,
            unverified: false,
        });
    });

    test("trusts a role/vip/unverified snapshot for an absent sender instead of the empty live maps", () => {
        const snapshot: BadgeSnapshot = { role: "staff", vip: true, unverified: true };
        expect(resolveBadges("ghost", snapshot)).toEqual({
            role: "staff",
            owner: false,
            vip: true,
            partner: false,
            subBadgeName: undefined,
            unverified: true,
        });
    });

    test("a role-aware snapshot overrides stale live state for the same sender, not just the absent case", () => {
        roles.set("modu", "mod");
        vips.add("modu");
        unverified.add("modu");
        const snapshot: BadgeSnapshot = { role: undefined, vip: false, unverified: true };
        expect(resolveBadges("modu", snapshot)).toEqual({
            role: undefined,
            owner: false,
            vip: false,
            partner: false,
            subBadgeName: undefined,
            unverified: true,
        });
    });

    test("subscriber and partner snapshot fields override independently of the role-aware gate", () => {
        const snapshot: BadgeSnapshot = { partner: true, subBadge: "ambassador" };
        expect(resolveBadges("ghost", snapshot)).toEqual({
            role: undefined,
            owner: false,
            vip: false,
            partner: true,
            subBadgeName: "ambassador",
            unverified: false,
        });
    });

    test("sanitizes a malformed snapshot sub-badge name to regular", () => {
        const snapshot: BadgeSnapshot = { subBadge: "not a valid name!" };
        expect(resolveBadges("ghost", snapshot).subBadgeName).toBe("regular");
    });

    test("owner is always channel-derived, never carried on the snapshot", () => {
        ctx.channel = "#alice";
        expect(resolveBadges("alice", { role: "mod" }).owner).toBe(true);
        expect(resolveBadges("bob", { role: "mod" }).owner).toBe(false);
    });
});

function firstBadge(resolved: ReturnType<typeof resolveBadges>): StubElement {
    return renderBadges(resolved)[0] as unknown as StubElement;
}

describe("renderBadges", () => {
    beforeEach(resetLiveState);

    test("renders badges in a fixed order regardless of snapshot field order", () => {
        const resolved = resolveBadges("alice", { role: "staff", vip: true, partner: true, subBadge: "lucky", unverified: true });
        const names = renderBadges(resolved).map(img => (img as unknown as StubElement).alt);
        expect(names).toEqual(["staff", "op", "partner", "vip", "regular", "unverified"]);
    });

    test("ignores an unknown role value at the parser boundary, keeping renderBadges badge-free for role", () => {
        const resolved = resolveBadges("ghost", {});
        expect(renderBadges(resolved).length).toBe(0);
    });

    test("subscriber badge asset failure falls back to badge-regular.svg", () => {
        const resolved = resolveBadges("ghost", { subBadge: "ambassador" });
        const img = firstBadge(resolved);
        expect(img.src).toBe("/static/img/badge-ambassador.svg");
        img.fire("error");
        expect(img.src).toBe("/static/img/badge-regular.svg");
        expect(img.alt).toBe("regular");
    });

    test("a regular subscriber badge has no error fallback listener to fire", () => {
        const resolved = resolveBadges("ghost", { subBadge: "regular" });
        const img = firstBadge(resolved);
        expect(img.src).toBe("/static/img/badge-regular.svg");
        img.fire("error");
        expect(img.src).toBe("/static/img/badge-regular.svg");
    });
});
