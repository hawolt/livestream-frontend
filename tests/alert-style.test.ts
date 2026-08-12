import { describe, expect, test } from "bun:test";
import {
    DEFAULT_ALERT_STYLE,
    applyOverrides,
    cssVarsFor,
    hexToRgbTriplet,
    parseAlertStyle,
    substituteTemplate, tokenizeTemplate, templateHasName } from "../src/alerts/style.ts";

describe("parseAlertStyle", () => {
    test("returns defaults for null, undefined, non-objects and {}", () => {
        for (const raw of [null, undefined, 42, "classic", true, {}]) {
            expect(parseAlertStyle(raw)).toEqual(DEFAULT_ALERT_STYLE);
        }
    });

    test("clamps numbers exactly like the server", () => {
        expect(parseAlertStyle({ fontSizePx: 200 }).fontSizePx).toBe(96);
        expect(parseAlertStyle({ fontSizePx: 1 }).fontSizePx).toBe(10);
        expect(parseAlertStyle({ durationMs: 100 }).durationMs).toBe(1000);
        expect(parseAlertStyle({ durationMs: 90000 }).durationMs).toBe(30000);
        expect(parseAlertStyle({ bgOpacity: 3 }).bgOpacity).toBe(1);
        expect(parseAlertStyle({ bgOpacity: -1 }).bgOpacity).toBe(0);
        expect(parseAlertStyle({ cardScale: 0.1 }).cardScale).toBe(0.5);
        expect(parseAlertStyle({ cardScale: 9 }).cardScale).toBe(2);
        expect(parseAlertStyle({ fadeInMs: -5 }).fadeInMs).toBe(0);
        expect(parseAlertStyle({ fadeOutMs: 99999 }).fadeOutMs).toBe(5000);
    });

    test("rejects bad colors to defaults and lowercases uppercase hex", () => {
        expect(parseAlertStyle({ accent: "#zzz" }).accent).toBe(DEFAULT_ALERT_STYLE.accent);
        expect(parseAlertStyle({ accent: "red" }).accent).toBe(DEFAULT_ALERT_STYLE.accent);
        expect(parseAlertStyle({ bg: "#1234567" }).bg).toBe(DEFAULT_ALERT_STYLE.bg);
        expect(parseAlertStyle({ accent: "#FFD76A" }).accent).toBe("#ffd76a");
    });

    test("keeps valid presets and defaults unknown ones", () => {
        expect(parseAlertStyle({ preset: "banner" }).preset).toBe("banner");
        expect(parseAlertStyle({ preset: "minimal" }).preset).toBe("minimal");
        expect(parseAlertStyle({ preset: "neon" }).preset).toBe("classic");
    });

    test("falls back on empty and over-long templates", () => {
        expect(parseAlertStyle({ template: { follow: "" } }).template.follow).toBe("{name}{linebreak}just followed!");
        expect(parseAlertStyle({ template: { follow: "x".repeat(121) } }).template.follow).toBe("{name}{linebreak}just followed!");
        expect(parseAlertStyle({ template: { follow: "x".repeat(120) } }).template.follow).toBe("x".repeat(120));
    });
});

describe("applyOverrides", () => {
    const stored = parseAlertStyle({ durationMs: 10000, fontSizePx: 40 });

    test("duration override wins over stored durationMs", () => {
        expect(applyOverrides(stored, { durationMs: 3000 }).durationMs).toBe(3000);
    });

    test("absent override keeps stored value", () => {
        expect(applyOverrides(stored, {}).durationMs).toBe(10000);
        expect(applyOverrides(stored, {}).fontSizePx).toBe(40);
    });

    test("size override wins over stored fontSizePx", () => {
        expect(applyOverrides(stored, { fontSizePx: 16 }).fontSizePx).toBe(16);
        expect(applyOverrides(stored, { fontSizePx: 30 }).fontSizePx).toBe(30);
    });
});

describe("hexToRgbTriplet", () => {
    test("converts hex to a css rgb triplet", () => {
        expect(hexToRgbTriplet("#14121e")).toBe("20, 18, 30");
        expect(hexToRgbTriplet("#ffffff")).toBe("255, 255, 255");
    });
});

describe("cssVarsFor", () => {
    test("folds cardScale into the font size", () => {
        const vars = cssVarsFor(parseAlertStyle({ fontSizePx: 20, cardScale: 2 }));
        expect(vars["--alert-font-size"]).toBe("40px");
    });

    test("floors zero fades to 10ms", () => {
        const vars = cssVarsFor(parseAlertStyle({ fadeInMs: 0, fadeOutMs: 0 }));
        expect(vars["--alert-fade-in"]).toBe("10ms");
        expect(vars["--alert-fade-out"]).toBe("10ms");
    });
});

describe("substituteTemplate", () => {
    test("replaces every {name} and {viewers}", () => {
        const name = "a".repeat(32);
        expect(substituteTemplate("{name} and {name}: {viewers}", name, 5)).toBe(`${name} and ${name}: 5`);
    });

    test("leaves unknown placeholders untouched", () => {
        expect(substituteTemplate("{foo} {name}", "bob", 3)).toBe("{foo} bob");
    });

    test("output is a plain string even for HTML-looking input", () => {
        expect(substituteTemplate("<b>{name}</b>", "<i>x</i>", 0)).toBe("<b><i>x</i></b>");
    });
});

describe("tokenizeTemplate", () => {
    test("splits a template into name, break and text parts", () => {
        expect(tokenizeTemplate("{name}{linebreak}just followed!", "Bob", 0)).toEqual([
            { kind: "name", value: "Bob" },
            { kind: "break" },
            { kind: "text", value: "just followed!" },
        ]);
    });

    test("emits viewers as its own token and honours name position", () => {
        expect(tokenizeTemplate("raided by {name} with {viewers}!", "Ann", 12)).toEqual([
            { kind: "text", value: "raided by " },
            { kind: "name", value: "Ann" },
            { kind: "text", value: " with " },
            { kind: "viewers", value: "12" },
            { kind: "text", value: "!" },
        ]);
    });

    test("a template without a name placeholder yields no name token", () => {
        expect(templateHasName("just followed!")).toBe(false);
        expect(templateHasName("{name} followed")).toBe(true);
    });
});
