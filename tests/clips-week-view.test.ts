import { describe, expect, test } from "bun:test";
import {
    PODIUM_SIZE, byline, nextVote, optimisticScore, podium, rankLabel,
    remainder, scoreText, viewsText, type WeekClip,
} from "../src/clips-week/view.ts";

function clip(overrides: Partial<WeekClip> = {}): WeekClip {
    return {
        id: "abc", title: "A clip", channel: "kayleigh", creator: "kayleigh",
        mature: false, views: 10, score: 0, myVote: 0,
        createdAt: null, url: "/kayleigh/clip/abc", poster: null,
        ...overrides,
    };
}

describe("nextVote", () => {
    test("casts a vote from neutral", () => {
        expect(nextVote(0, 1)).toBe(1);
        expect(nextVote(0, -1)).toBe(-1);
    });

    test("clicking the same arrow again clears the vote", () => {
        expect(nextVote(1, 1)).toBe(0);
        expect(nextVote(-1, -1)).toBe(0);
    });

    test("clicking the opposite arrow flips it", () => {
        expect(nextVote(1, -1)).toBe(-1);
        expect(nextVote(-1, 1)).toBe(1);
    });
});

describe("optimisticScore", () => {
    test("an upvote from neutral adds one", () => {
        expect(optimisticScore(5, 0, 1)).toBe(6);
    });

    test("clearing an upvote takes it back", () => {
        expect(optimisticScore(6, 1, 0)).toBe(5);
    });

    test("flipping from up to down moves two", () => {
        expect(optimisticScore(6, 1, -1)).toBe(4);
    });

    test("flipping from down to up moves two the other way", () => {
        expect(optimisticScore(4, -1, 1)).toBe(6);
    });
});

describe("podium split", () => {
    const clips = Array.from({ length: 7 }, (_, i) => clip({ id: `c${i}` }));

    test("the top three are featured", () => {
        expect(podium(clips).map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
        expect(PODIUM_SIZE).toBe(3);
    });

    test("everything else falls to the list", () => {
        expect(remainder(clips).map((c) => c.id)).toEqual(["c3", "c4", "c5", "c6"]);
    });

    test("a short week does not break the split", () => {
        expect(podium(clips.slice(0, 2))).toHaveLength(2);
        expect(remainder(clips.slice(0, 2))).toEqual([]);
        expect(podium([])).toEqual([]);
        expect(remainder([])).toEqual([]);
    });
});

describe("formatting", () => {
    test("ranks are one based", () => {
        expect(rankLabel(0)).toBe("#1");
        expect(rankLabel(3)).toBe("#4");
    });

    test("a positive score carries its sign so the ranking reads clearly", () => {
        expect(scoreText(12)).toBe("+12");
        expect(scoreText(0)).toBe("0");
        expect(scoreText(-4)).toBe("-4");
    });

    test("views read naturally at one", () => {
        expect(viewsText(1)).toBe("1 view");
        expect(viewsText(2)).toBe("2 views");
    });

    test("the byline names the clipper only when it differs from the channel", () => {
        expect(byline(clip())).toBe("kayleigh");
        expect(byline(clip({ creator: "vortexed" }))).toBe("kayleigh, clipped by vortexed");
        expect(byline(clip({ creator: "" }))).toBe("kayleigh");
    });
});
