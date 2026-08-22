import { expect, test } from "bun:test";
import { ACCENT_THEMES, DEFAULT_ACCENT, accentIcons, accentLabel, normalizeAccent } from "../src/theme.ts";

test("every theme has a distinct id, a label, a hex swatch and its own icons", () => {
    const ids = new Set(ACCENT_THEMES.map(t => t.id));
    expect(ids.size).toBe(ACCENT_THEMES.length);
    const favicons = new Set(ACCENT_THEMES.map(t => t.favicon));
    const touchIcons = new Set(ACCENT_THEMES.map(t => t.touchIcon));
    expect(favicons.size).toBe(ACCENT_THEMES.length);
    expect(touchIcons.size).toBe(ACCENT_THEMES.length);
    for (const theme of ACCENT_THEMES) {
        expect(theme.label.length).toBeGreaterThan(0);
        expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/);
        expect(theme.favicon).toMatch(/^\/static\/img\/.+\.png$/);
        expect(theme.touchIcon).toMatch(/^\/static\/img\/.+\.png$/);
    }
});

test("the default theme keeps the original icon filenames", () => {
    const theme = ACCENT_THEMES.find(t => t.id === DEFAULT_ACCENT)!;
    expect(theme.favicon).toBe("/static/img/favicon.png");
    expect(theme.touchIcon).toBe("/static/img/icon.png");
});

test("accentIcons resolves the icon pair for known ids and falls back for unknown ones", () => {
    expect(accentIcons("beacon")).toEqual({ favicon: "/static/img/favicon-beacon.png", touchIcon: "/static/img/icon-beacon.png" });
    expect(accentIcons("malachite")).toEqual({ favicon: "/static/img/favicon.png", touchIcon: "/static/img/icon.png" });
    expect(accentIcons("nonsense")).toEqual(accentIcons(DEFAULT_ACCENT));
});

test("the default accent is one of the defined themes", () => {
    expect(ACCENT_THEMES.some(t => t.id === DEFAULT_ACCENT)).toBe(true);
});

test("known ids survive normalization, including odd casing and padding", () => {
    expect(normalizeAccent("beacon")).toBe("beacon");
    expect(normalizeAccent("  BEACON  ")).toBe("beacon");
    expect(normalizeAccent("Malachite")).toBe("malachite");
});

test("anything unknown or malformed falls back to the default", () => {
    expect(normalizeAccent("cobalt")).toBe(DEFAULT_ACCENT);
    expect(normalizeAccent("")).toBe(DEFAULT_ACCENT);
    expect(normalizeAccent(null)).toBe(DEFAULT_ACCENT);
    expect(normalizeAccent(undefined)).toBe(DEFAULT_ACCENT);
    expect(normalizeAccent(7)).toBe(DEFAULT_ACCENT);
    expect(normalizeAccent({ id: "beacon" })).toBe(DEFAULT_ACCENT);
});

test("labels resolve for known ids and fall back for unknown ones", () => {
    expect(accentLabel("beacon")).toBe("Beacon");
    expect(accentLabel("malachite")).toBe("Malachite");
    expect(accentLabel("nonsense")).toBe(accentLabel(DEFAULT_ACCENT));
});
