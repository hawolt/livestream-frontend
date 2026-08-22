import { describe, expect, test } from "bun:test";
import {
    badgeSetsFromPayload,
    mergeBadgeSets,
    parseBadgeTagEntries,
    resolveTwitchBadges,
    type TwitchBadgeSets,
} from "../src/twitch-badges.ts";

describe("parseBadgeTagEntries", () => {
    test("splits name/version pairs", () => {
        expect(parseBadgeTagEntries("moderator/1,subscriber/12")).toEqual([
            { name: "moderator", version: "1" },
            { name: "subscriber", version: "12" },
        ]);
    });

    test("defaults the version to 1 when a slash is missing", () => {
        expect(parseBadgeTagEntries("vip")).toEqual([{ name: "vip", version: "1" }]);
    });

    test("returns nothing for an empty tag", () => {
        expect(parseBadgeTagEntries("")).toEqual([]);
    });

    test("skips empty entries from stray commas", () => {
        expect(parseBadgeTagEntries("vip/1,,moderator/1")).toEqual([
            { name: "vip", version: "1" },
            { name: "moderator", version: "1" },
        ]);
    });
});

describe("badgeSetsFromPayload", () => {
    test("reads versions out of the badge_sets shape", () => {
        const sets = badgeSetsFromPayload({
            badge_sets: {
                vip: {
                    versions: {
                        "1": {
                            image_url_2x: "a2x",
                            title: "VIP",
                        },
                    },
                },
            },
        });
        expect(sets).toEqual({
            vip: { "1": { image_url_2x: "a2x", title: "VIP" } },
        });
    });

    test("drops a version missing the 2x image url", () => {
        const sets = badgeSetsFromPayload({
            badge_sets: { vip: { versions: { "1": { title: "VIP" } } } },
        });
        expect(sets).toEqual({});
    });

    test("falls back to the set id when a title is missing", () => {
        const sets = badgeSetsFromPayload({
            badge_sets: {
                bits: {
                    versions: {
                        "100": { image_url_2x: "b" },
                    },
                },
            },
        });
        expect(sets.bits!["100"]!.title).toBe("bits");
    });

    test("returns an empty map for a malformed or missing payload", () => {
        expect(badgeSetsFromPayload(null)).toEqual({});
        expect(badgeSetsFromPayload({})).toEqual({});
        expect(badgeSetsFromPayload({ badge_sets: "nope" })).toEqual({});
    });
});

describe("mergeBadgeSets", () => {
    const globalSets: TwitchBadgeSets = {
        subscriber: {
            "0": { image_url_2x: "g2", title: "Sub" },
        },
        moderator: {
            "1": { image_url_2x: "m2", title: "Moderator" },
        },
    };

    test("channel versions win over global versions in the same set", () => {
        const channelSets: TwitchBadgeSets = {
            subscriber: {
                "0": { image_url_2x: "c2", title: "Channel Sub" },
            },
        };
        const merged = mergeBadgeSets(globalSets, channelSets);
        expect(merged.subscriber!["0"]!.title).toBe("Channel Sub");
        expect(merged.moderator!["1"]!.title).toBe("Moderator");
    });

    test("keeps global-only sets untouched by an empty channel payload", () => {
        const merged = mergeBadgeSets(globalSets, {});
        expect(merged).toEqual(globalSets);
    });

    test("adds channel-only sets that have no global counterpart", () => {
        const channelSets: TwitchBadgeSets = {
            "bits-leader": {
                "1": { image_url_2x: "b2", title: "Bits Leader" },
            },
        };
        const merged = mergeBadgeSets(globalSets, channelSets);
        expect(merged["bits-leader"]).toBeDefined();
        expect(merged.subscriber).toBeDefined();
    });
});

describe("acceptance: path-of-exile-2-badge from room 171402081", () => {
    const helixShapedFixture = {
        badge_sets: {
            "path-of-exile-2-badge": {
                versions: {
                    "1": {
                        image_url_2x: "https://static-cdn.jtvnw.net/badges/v1/8bebe4ce-6c15-4746-8c33-42312c250ceb/1",
                        title: "Path of Exile 2",
                    },
                },
            },
        },
    };

    test("resolves the captured IRC tag to the exact captured CDN image when it ships in the global set and the channel set is empty", () => {
        const globalSets = badgeSetsFromPayload(helixShapedFixture);
        const channelSets = badgeSetsFromPayload({ badge_sets: {} });
        const merged = mergeBadgeSets(globalSets, channelSets);
        expect(resolveTwitchBadges("path-of-exile-2-badge/1", merged)).toEqual([
            {
                name: "path-of-exile-2-badge",
                url: "https://static-cdn.jtvnw.net/badges/v1/8bebe4ce-6c15-4746-8c33-42312c250ceb/1",
                title: "Path of Exile 2",
            },
        ]);
    });

    test("resolves the same way when the campaign badge ships in the channel set instead of global", () => {
        const globalSets = badgeSetsFromPayload({ badge_sets: {} });
        const channelSets = badgeSetsFromPayload(helixShapedFixture);
        const merged = mergeBadgeSets(globalSets, channelSets);
        expect(resolveTwitchBadges("path-of-exile-2-badge/1", merged)).toEqual([
            {
                name: "path-of-exile-2-badge",
                url: "https://static-cdn.jtvnw.net/badges/v1/8bebe4ce-6c15-4746-8c33-42312c250ceb/1",
                title: "Path of Exile 2",
            },
        ]);
    });
});

describe("resolveTwitchBadges", () => {
    const sets: TwitchBadgeSets = {
        moderator: {
            "1": { image_url_2x: "m2", title: "Moderator" },
        },
        subscriber: {
            "3": { image_url_2x: "s2", title: "3-Month Subscriber" },
        },
    };

    test("resolves the exact name/version pair using the 2x image", () => {
        expect(resolveTwitchBadges("moderator/1", sets)).toEqual([
            { name: "moderator", url: "m2", title: "Moderator" },
        ]);
    });

    test("picks the matching tier art, not just the badge name", () => {
        expect(resolveTwitchBadges("subscriber/3", sets)).toEqual([
            { name: "subscriber", url: "s2", title: "3-Month Subscriber" },
        ]);
    });

    test("drops a badge whose version is not in the sets", () => {
        expect(resolveTwitchBadges("subscriber/99", sets)).toEqual([]);
    });

    test("drops a badge name that is not in the sets at all", () => {
        expect(resolveTwitchBadges("chaos-orb-event/1", sets)).toEqual([]);
    });

    test("renders nothing for every badge when the sets are empty", () => {
        expect(resolveTwitchBadges("moderator/1,subscriber/3", {})).toEqual([]);
    });

    test("resolves the badges it can and drops the ones it cannot", () => {
        expect(resolveTwitchBadges("moderator/1,subscriber/99", sets)).toEqual([
            { name: "moderator", url: "m2", title: "Moderator" },
        ]);
    });
});
