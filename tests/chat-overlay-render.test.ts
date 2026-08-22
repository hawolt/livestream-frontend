import { beforeEach, describe, expect, test } from "bun:test";

class StubElement {
    tagName: string;
    className = "";
    src = "";
    alt = "";
    title = "";
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

(globalThis as unknown as { document: unknown }).document = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    getElementById(): null {
        return null;
    },
};

const { resolveBadges, renderBadges } = await import("../src/chat-overlay/render.ts");
const { ctx, partners, roles, subscriberBadges, subscribers, unverified, vips } = await import("../src/chat-overlay/context.ts");
type BadgeSnapshot = Parameters<typeof resolveBadges>[1];

function resetLiveState(): void {
    roles.clear();
    vips.clear();
    partners.clear();
    subscribers.clear();
    subscriberBadges.clear();
    unverified.clear();
    ctx.channel = "#alice";
    ctx.showBadges = true;
}

describe("chat-overlay resolveBadges", () => {
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

    test("a role-aware snapshot overrides stale live state for the same sender", () => {
        roles.set("modu", "mod");
        vips.add("modu");
        unverified.add("modu");
        const snapshot: BadgeSnapshot = { role: undefined, vip: false, unverified: true };
        expect(resolveBadges("modu", snapshot).role).toBeUndefined();
        expect(resolveBadges("modu", snapshot).vip).toBe(false);
    });

    test("sanitizes a malformed snapshot sub-badge name to regular", () => {
        const snapshot: BadgeSnapshot = { subBadge: "not a valid name!" };
        expect(resolveBadges("ghost", snapshot).subBadgeName).toBe("regular");
    });

    test("owner is always channel-derived, never carried on the snapshot", () => {
        expect(resolveBadges("alice", { role: "mod" }).owner).toBe(true);
        expect(resolveBadges("bob", { role: "mod" }).owner).toBe(false);
    });
});

function firstBadge(resolved: ReturnType<typeof resolveBadges>): StubElement {
    return renderBadges(resolved)[0] as unknown as StubElement;
}

describe("chat-overlay renderBadges", () => {
    beforeEach(resetLiveState);

    test("renders badges in a fixed order regardless of snapshot field order", () => {
        const resolved = resolveBadges("alice", { role: "staff", vip: true, partner: true, subBadge: "lucky", unverified: true });
        const names = renderBadges(resolved).map(img => (img as unknown as StubElement).alt);
        expect(names).toEqual(["staff", "op", "partner", "vip", "regular", "unverified"]);
    });

    test("subscriber badge asset failure falls back to badge-regular.svg", () => {
        const resolved = resolveBadges("ghost", { subBadge: "ambassador" });
        const img = firstBadge(resolved);
        expect(img.src).toBe("/static/img/badge-ambassador.svg");
        img.fire("error");
        expect(img.src).toBe("/static/img/badge-regular.svg");
        expect(img.alt).toBe("regular");
    });

    test("missing snapshot data renders no badges for an absent unknown sender", () => {
        const resolved = resolveBadges("ghost", {});
        expect(renderBadges(resolved).length).toBe(0);
    });
});
