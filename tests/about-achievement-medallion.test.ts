import { expect, test } from "bun:test";
import { achievementMedallionSvg } from "../src/live/about/achievement-medallion.ts";
import { ACHIEVEMENT_GLYPHS, ACHIEVEMENT_NAMES } from "../src/live/about/achievement-catalog.ts";

test("every known achievement key has both a display name and a glyph", () => {
    expect(Object.keys(ACHIEVEMENT_GLYPHS).sort()).toEqual(Object.keys(ACHIEVEMENT_NAMES).sort());
});

test("composes a ring, disc and glyph at the requested size", () => {
    const svg = achievementMedallionSvg("followers", 3, 52);
    expect(svg).toContain('width="52"');
    expect(svg).toContain('height="52"');
    expect(svg).toContain('viewBox="0 0 40 40"');
    expect(svg).toContain('stroke="#fbbf24"');
    expect(svg).toContain('fill="#1a2029"');
});

test("the ring color tracks the tier while the glyph stays the same", () => {
    const bronze = achievementMedallionSvg("followers", 1, 48);
    const silver = achievementMedallionSvg("followers", 2, 48);
    expect(bronze).toContain('stroke="#b45309"');
    expect(silver).toContain('stroke="#94a3b8"');
});
