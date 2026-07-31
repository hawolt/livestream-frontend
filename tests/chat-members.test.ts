import { beforeEach, describe, expect, test } from "bun:test";
import { ctx } from "../src/chat/context.ts";
import {
    applyNamesList,
    colors,
    decodeNamePrefix,
    guests,
    knownMembers,
    memberDisplay,
    memberRankBucket,
    removeMember,
    roles,
    subscribers,
    unverified,
    vips,
} from "../src/chat/members.ts";

function resetMembers(): void {
    roles.clear();
    vips.clear();
    subscribers.clear();
    unverified.clear();
    guests.clear();
    knownMembers.clear();
    memberDisplay.clear();
    colors.clear();
    ctx.channel = "#somechannel";
    ctx.nick = "";
}

describe("decodeNamePrefix", () => {
    beforeEach(resetMembers);

    test("decodes each single-character role prefix", () => {
        expect(decodeNamePrefix("@Owner")).toEqual({ role: "op", vip: false, sub: false, unver: false, guest: false, name: "Owner" });
        expect(decodeNamePrefix("%Staffer")).toEqual({ role: "staff", vip: false, sub: false, unver: false, guest: false, name: "Staffer" });
        expect(decodeNamePrefix("&Botty")).toEqual({ role: "bot", vip: false, sub: false, unver: false, guest: false, name: "Botty" });
        expect(decodeNamePrefix("+Modder")).toEqual({ role: "mod", vip: false, sub: false, unver: false, guest: false, name: "Modder" });
    });

    test("decodes the vip, subscriber, unverified and guest flag prefixes", () => {
        expect(decodeNamePrefix("~Vippy")).toEqual({ role: null, vip: true, sub: false, unver: false, guest: false, name: "Vippy" });
        expect(decodeNamePrefix("*Subby")).toEqual({ role: null, vip: false, sub: true, unver: false, guest: false, name: "Subby" });
        expect(decodeNamePrefix("=Newbie")).toEqual({ role: null, vip: false, sub: false, unver: true, guest: false, name: "Newbie" });
        expect(decodeNamePrefix("?Guesty")).toEqual({ role: null, vip: false, sub: false, unver: false, guest: true, name: "Guesty" });
    });

    test("combines multiple prefix characters in the same run", () => {
        expect(decodeNamePrefix("@~Combo")).toEqual({ role: "op", vip: true, sub: false, unver: false, guest: false, name: "Combo" });
        expect(decodeNamePrefix("+=~Combo2")).toEqual({ role: "mod", vip: true, sub: false, unver: true, guest: false, name: "Combo2" });
        expect(decodeNamePrefix("~*Combo3")).toEqual({ role: null, vip: true, sub: true, unver: false, guest: false, name: "Combo3" });
    });

    test("a later role prefix in the run overrides an earlier one", () => {
        expect(decodeNamePrefix("@%Both")).toEqual({ role: "staff", vip: false, sub: false, unver: false, guest: false, name: "Both" });
    });

    test("stops consuming the run at the first character that is not a prefix", () => {
        expect(decodeNamePrefix("plain")).toEqual({ role: null, vip: false, sub: false, unver: false, guest: false, name: "plain" });
        expect(decodeNamePrefix("a@b")).toEqual({ role: null, vip: false, sub: false, unver: false, guest: false, name: "a@b" });
    });

    test("a prefix run with nothing after it yields an empty name", () => {
        expect(decodeNamePrefix("@~=")).toEqual({ role: "op", vip: true, sub: false, unver: true, guest: false, name: "" });
    });
});

describe("applyNamesList", () => {
    beforeEach(resetMembers);

    test("populates membership collections from a NAMES payload", () => {
        applyNamesList("@Owner %Staffer ~Vippy *Subby ?Guesty plainuser");
        expect(memberDisplay.get("owner")).toBe("Owner");
        expect(roles.get("owner")).toBe("op");
        expect(roles.get("staffer")).toBe("staff");
        expect(vips.has("vippy")).toBe(true);
        expect(subscribers.has("subby")).toBe(true);
        expect(guests.has("guesty")).toBe(true);
        expect(knownMembers.has("plainuser")).toBe(true);
        expect(roles.has("plainuser")).toBe(false);
    });

    test("skips blank tokens produced by repeated whitespace", () => {
        applyNamesList("  @Owner    plainuser  ");
        expect(knownMembers.size).toBe(2);
    });

    test("a later NAMES payload without a flag clears that flag for the member", () => {
        applyNamesList("~Vippy");
        expect(vips.has("vippy")).toBe(true);
        applyNamesList("Vippy");
        expect(vips.has("vippy")).toBe(false);
        expect(knownMembers.has("vippy")).toBe(true);
    });

    test("a later NAMES payload without the subscriber flag clears it for the member", () => {
        applyNamesList("*Subby");
        expect(subscribers.has("subby")).toBe(true);
        applyNamesList("Subby");
        expect(subscribers.has("subby")).toBe(false);
        expect(knownMembers.has("subby")).toBe(true);
    });
});

describe("removeMember", () => {
    beforeEach(resetMembers);

    test("removes a known member from every collection", () => {
        applyNamesList("@Owner");
        expect(knownMembers.has("owner")).toBe(true);
        removeMember("owner");
        expect(knownMembers.has("owner")).toBe(false);
        expect(memberDisplay.has("owner")).toBe(false);
        expect(roles.has("owner")).toBe(false);
    });

    test("removes a subscriber from the subscribers collection", () => {
        applyNamesList("*Subby");
        expect(subscribers.has("subby")).toBe(true);
        removeMember("subby");
        expect(subscribers.has("subby")).toBe(false);
    });

    test("is a no-op for a member that is not known", () => {
        expect(() => removeMember("ghost")).not.toThrow();
        expect(knownMembers.has("ghost")).toBe(false);
    });
});

describe("memberRankBucket", () => {
    beforeEach(resetMembers);

    test("orders buckets staff above owner above bot above mod above vip above user above guest", () => {
        ctx.channel = "#owner";
        roles.set("staffkey", "staff");
        roles.set("botkey", "bot");
        roles.set("modkey", "mod");
        vips.add("vipkey");
        guests.add("guestkey");
        expect(memberRankBucket("staffkey")).toBe(6);
        expect(memberRankBucket("owner")).toBe(5);
        expect(memberRankBucket("botkey")).toBe(4);
        expect(memberRankBucket("modkey")).toBe(3);
        expect(memberRankBucket("vipkey")).toBe(2);
        expect(memberRankBucket("regularkey")).toBe(1);
        expect(memberRankBucket("guestkey")).toBe(0);
    });

    test("the staff bucket check runs before the owner check, so a staff owner ranks as staff", () => {
        ctx.channel = "#owner";
        roles.set("owner", "staff");
        expect(memberRankBucket("owner")).toBe(6);
    });
});
