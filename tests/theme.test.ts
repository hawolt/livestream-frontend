import { expect, test } from "bun:test";
import {
    ACCENT_COOKIE_MAX_AGE_SECONDS,
    ACCENT_STORAGE_KEY,
    ACCENT_THEMES,
    DEFAULT_ACCENT,
    accentIcons,
    accentLabel,
    buildCookieAttributes,
    candidateCookieDomains,
    isIpAddress,
    normalizeAccent,
    parseCookie,
    renderPrePaintSnippet,
    resolveStoredAccent,
} from "../src/theme.ts";

test("every theme has a distinct id, a label and a hex swatch", () => {
    const ids = new Set(ACCENT_THEMES.map(t => t.id));
    expect(ids.size).toBe(ACCENT_THEMES.length);
    for (const theme of ACCENT_THEMES) {
        expect(theme.label.length).toBeGreaterThan(0);
        expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
});

test("there are fourteen themes in the deliberate green through neutral ramp order", () => {
    expect(ACCENT_THEMES.map(t => t.id)).toEqual([
        "malachite", "verdigris", "lagoon", "aquamarine", "beacon", "glacier",
        "azurite", "cornflower", "iris", "amethyst", "wisteria", "orchid",
        "fuchsite", "moonstone",
    ]);
});

test("only malachite and beacon carry their own favicon pair", () => {
    for (const theme of ACCENT_THEMES) {
        if (theme.id === "malachite" || theme.id === "beacon") {
            expect(theme.favicon).toMatch(/^\/static\/img\/.+\.png$/);
            expect(theme.touchIcon).toMatch(/^\/static\/img\/.+\.png$/);
        } else {
            expect(theme.favicon).toBeUndefined();
            expect(theme.touchIcon).toBeUndefined();
        }
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

test("accentIcons falls back to malachite's icons for every theme without its own pair", () => {
    const malachite = accentIcons("malachite");
    for (const theme of ACCENT_THEMES) {
        if (theme.id === "malachite" || theme.id === "beacon") continue;
        expect(accentIcons(theme.id)).toEqual(malachite);
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

test("isIpAddress recognizes dotted-quad and colon-form addresses", () => {
    expect(isIpAddress("192.168.1.5")).toBe(true);
    expect(isIpAddress("127.0.0.1")).toBe(true);
    expect(isIpAddress("::1")).toBe(true);
    expect(isIpAddress("fe80::1")).toBe(true);
    expect(isIpAddress("itzon.tv")).toBe(false);
    expect(isIpAddress("studio.itzon.tv")).toBe(false);
    expect(isIpAddress("localhost")).toBe(false);
});

test("candidateCookieDomains has no usable parent for localhost or an IP", () => {
    expect(candidateCookieDomains("localhost")).toEqual([]);
    expect(candidateCookieDomains("127.0.0.1")).toEqual([]);
    expect(candidateCookieDomains("::1")).toEqual([]);
    expect(candidateCookieDomains("")).toEqual([]);
});

test("candidateCookieDomains walks a two label host to just the apex", () => {
    expect(candidateCookieDomains("itzon.tv")).toEqual(["itzon.tv"]);
    expect(candidateCookieDomains("studio.itzon.tv")).toEqual(["itzon.tv", "studio.itzon.tv"]);
});

test("candidateCookieDomains does not assume exactly two labels", () => {
    expect(candidateCookieDomains("a.b.example.co.uk")).toEqual([
        "co.uk",
        "example.co.uk",
        "b.example.co.uk",
        "a.b.example.co.uk",
    ]);
});

test("candidateCookieDomains orders broadest first, narrowest last", () => {
    const candidates = candidateCookieDomains("deep.studio.itzon.tv");
    expect(candidates).toEqual(["itzon.tv", "studio.itzon.tv", "deep.studio.itzon.tv"]);
    for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i]!.length).toBeGreaterThanOrEqual(candidates[i - 1]!.length);
    }
});

test("parseCookie finds the named cookie among others", () => {
    expect(parseCookie("foo=bar; site_accent=beacon; other=1", "site_accent")).toBe("beacon");
    expect(parseCookie("site_accent=beacon", "site_accent")).toBe("beacon");
    expect(parseCookie("foo=bar", "site_accent")).toBeNull();
    expect(parseCookie("", "site_accent")).toBeNull();
});

test("parseCookie decodes a url encoded value", () => {
    expect(parseCookie("site_accent=beacon%20theme", "site_accent")).toBe("beacon theme");
});

test("parseCookie takes the first match when the name appears twice", () => {
    expect(parseCookie("site_accent=malachite; site_accent=beacon", "site_accent")).toBe("malachite");
});

test("buildCookieAttributes always carries path, max age and SameSite", () => {
    const attrs = buildCookieAttributes({ maxAgeSeconds: ACCENT_COOKIE_MAX_AGE_SECONDS, secure: false });
    expect(attrs).toBe(`Path=/; Max-Age=${ACCENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`);
});

test("buildCookieAttributes adds Domain only when given one", () => {
    const attrs = buildCookieAttributes({ maxAgeSeconds: 10, domain: "itzon.tv", secure: false });
    expect(attrs).toBe("Path=/; Max-Age=10; SameSite=Lax; Domain=itzon.tv");
});

test("buildCookieAttributes adds Secure only when asked", () => {
    const attrs = buildCookieAttributes({ maxAgeSeconds: 10, secure: true });
    expect(attrs).toContain("; Secure");
    expect(buildCookieAttributes({ maxAgeSeconds: 10, secure: false })).not.toContain("Secure");
});

test("resolveStoredAccent trusts the cookie and never migrates when it is present", () => {
    expect(resolveStoredAccent("beacon", null)).toEqual({ accent: "beacon", shouldMigrate: false });
    expect(resolveStoredAccent("beacon", "malachite")).toEqual({ accent: "beacon", shouldMigrate: false });
});

test("resolveStoredAccent adopts localStorage and asks to migrate when there is no cookie", () => {
    expect(resolveStoredAccent(null, "beacon")).toEqual({ accent: "beacon", shouldMigrate: true });
});

test("resolveStoredAccent falls back to the default with nothing stored anywhere", () => {
    expect(resolveStoredAccent(null, null)).toEqual({ accent: DEFAULT_ACCENT, shouldMigrate: false });
});

test("resolveStoredAccent normalizes whatever it finds", () => {
    expect(resolveStoredAccent("nonsense", null)).toEqual({ accent: DEFAULT_ACCENT, shouldMigrate: false });
    expect(resolveStoredAccent(null, "nonsense")).toEqual({ accent: DEFAULT_ACCENT, shouldMigrate: true });
});

test("renderPrePaintSnippet reads the cookie before localStorage and stays a single script tag", () => {
    const snippet = renderPrePaintSnippet();
    expect(snippet.startsWith("<script>")).toBe(true);
    expect(snippet.endsWith("</script>")).toBe(true);
    expect(snippet).toContain(ACCENT_STORAGE_KEY);
    expect(snippet.indexOf("document.cookie")).toBeLessThan(snippet.indexOf("localStorage.getItem"));
    expect(snippet).not.toContain("\n");
});

test("renderPrePaintSnippet carries an icon override only for themes with their own favicon pair", () => {
    const snippet = renderPrePaintSnippet();
    for (const theme of ACCENT_THEMES) {
        if (theme.id === DEFAULT_ACCENT || !theme.favicon || !theme.touchIcon) continue;
        expect(snippet).toContain(theme.favicon);
        expect(snippet).toContain(theme.touchIcon);
    }
    expect(snippet).not.toContain("verdigris");
    expect(snippet).not.toContain("moonstone");
});
