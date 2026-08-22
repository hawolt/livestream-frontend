import { expect, test } from "bun:test";
import { ACCENT_THEMES, DEFAULT_ACCENT, accentLabel, normalizeAccent } from "../src/theme.ts";

test("every theme has a distinct id, a label and a hex swatch", () => {
    const ids = new Set(ACCENT_THEMES.map(t => t.id));
    expect(ids.size).toBe(ACCENT_THEMES.length);
    for (const theme of ACCENT_THEMES) {
        expect(theme.label.length).toBeGreaterThan(0);
        expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
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
