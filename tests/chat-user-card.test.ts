import { describe, expect, test } from "bun:test";
import { followingSinceLabel, memberSince } from "../src/chat/user-card.ts";

describe("memberSince", () => {
    test("formats a timestamp as month and year", () => {
        expect(memberSince(Date.UTC(2024, 2, 15))).toBe("Member since Mar 2024");
    });

    test("returns empty for null or zero", () => {
        expect(memberSince(null)).toBe("");
        expect(memberSince(0)).toBe("");
    });
});

describe("followingSinceLabel", () => {
    test("formats a timestamp as a full day, month and year", () => {
        expect(followingSinceLabel(new Date(2024, 2, 15).getTime())).toBe("Following since Mar 15, 2024");
    });

    test("keeps the day unpadded on single digit dates", () => {
        expect(followingSinceLabel(new Date(2024, 11, 3).getTime())).toBe("Following since Dec 3, 2024");
    });

    test("returns empty for null", () => {
        expect(followingSinceLabel(null)).toBe("");
    });

    test("returns empty for zero", () => {
        expect(followingSinceLabel(0)).toBe("");
    });

    test("returns empty for NaN or Infinity", () => {
        expect(followingSinceLabel(Number.NaN)).toBe("");
        expect(followingSinceLabel(Number.POSITIVE_INFINITY)).toBe("");
    });
});
