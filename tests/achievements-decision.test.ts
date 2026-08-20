import { expect, test } from "bun:test";
import { tierRingColor, toRomanNumeral, capAchievements } from "../src/achievements/achievements-decision.ts";

test("tierRingColor climbs through the metals as decided", () => {
    expect(tierRingColor(1)).toBe("#b45309");
    expect(tierRingColor(2)).toBe("#94a3b8");
    expect(tierRingColor(3)).toBe("#fbbf24");
    expect(tierRingColor(4)).toBe("#34d399");
    expect(tierRingColor(5)).toBe("#60a5fa");
    expect(tierRingColor(6)).toBe("#a78bfa");
});

test("tierRingColor stays diamond from tier seven on", () => {
    expect(tierRingColor(7)).toBe("#e8edf4");
    expect(tierRingColor(8)).toBe("#e8edf4");
    expect(tierRingColor(100)).toBe("#e8edf4");
});

test("tierRingColor is defensive about invalid tiers", () => {
    expect(tierRingColor(0)).toBe("#b45309");
    expect(tierRingColor(-5)).toBe("#b45309");
    expect(tierRingColor(2.9)).toBe("#94a3b8");
});

test("toRomanNumeral formats the low tiers used by the ladder", () => {
    expect(toRomanNumeral(1)).toBe("I");
    expect(toRomanNumeral(2)).toBe("II");
    expect(toRomanNumeral(3)).toBe("III");
    expect(toRomanNumeral(4)).toBe("IV");
    expect(toRomanNumeral(5)).toBe("V");
    expect(toRomanNumeral(9)).toBe("IX");
    expect(toRomanNumeral(14)).toBe("XIV");
    expect(toRomanNumeral(40)).toBe("XL");
});

test("toRomanNumeral clamps below one up to one", () => {
    expect(toRomanNumeral(0)).toBe("I");
    expect(toRomanNumeral(-3)).toBe("I");
});

test("capAchievements keeps everything visible under the cap", () => {
    expect(capAchievements([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], overflow: [] });
});

test("capAchievements splits visible from overflow past the cap", () => {
    expect(capAchievements([1, 2, 3, 4, 5], 3)).toEqual({ visible: [1, 2, 3], overflow: [4, 5] });
});

test("capAchievements treats an exact match as fully visible", () => {
    expect(capAchievements([1, 2, 3], 3)).toEqual({ visible: [1, 2, 3], overflow: [] });
});
