export type AlertPreset = "classic" | "minimal" | "banner";

export interface AlertStyle {
    preset: AlertPreset;
    accent: string;
    bg: string;
    bgOpacity: number;
    textColor: string;
    fontSizePx: number;
    cardScale: number;
    durationMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    template: { follow: string; raid: string };
}

export const DEFAULT_ALERT_STYLE: AlertStyle = {
    preset: "classic",
    accent: "#ffd76a",
    bg: "#14121e",
    bgOpacity: 0.85,
    textColor: "#ffffff",
    fontSizePx: 22,
    cardScale: 1,
    durationMs: 5000,
    fadeInMs: 500,
    fadeOutMs: 350,
    template: { follow: "just followed!", raid: "just raided with {viewers} viewers!" },
};

const PRESETS: readonly AlertPreset[] = ["classic", "minimal", "banner"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
}

function color(value: unknown, fallback: string): string {
    return typeof value === "string" && COLOR_RE.test(value) ? value.toLowerCase() : fallback;
}

function template(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : fallback;
}

export function parseAlertStyle(raw: unknown): AlertStyle {
    const d = DEFAULT_ALERT_STYLE;
    if (!raw || typeof raw !== "object") return { ...d, template: { ...d.template } };
    const o = raw as Record<string, unknown>;
    const t = (o.template && typeof o.template === "object" ? o.template : {}) as Record<string, unknown>;
    const preset = PRESETS.includes(o.preset as AlertPreset) ? o.preset as AlertPreset : d.preset;
    return {
        preset,
        accent: color(o.accent, d.accent),
        bg: color(o.bg, d.bg),
        bgOpacity: clampNum(o.bgOpacity, d.bgOpacity, 0, 1),
        textColor: color(o.textColor, d.textColor),
        fontSizePx: clampNum(o.fontSizePx, d.fontSizePx, 10, 96),
        cardScale: clampNum(o.cardScale, d.cardScale, 0.5, 2),
        durationMs: clampNum(o.durationMs, d.durationMs, 1000, 30000),
        fadeInMs: clampNum(o.fadeInMs, d.fadeInMs, 0, 5000),
        fadeOutMs: clampNum(o.fadeOutMs, d.fadeOutMs, 0, 5000),
        template: {
            follow: template(t.follow, d.template.follow),
            raid: template(t.raid, d.template.raid),
        },
    };
}

export interface OverlayOverrides {
    fontSizePx?: number;
    durationMs?: number;
}

export function applyOverrides(style: AlertStyle, overrides: OverlayOverrides): AlertStyle {
    return {
        ...style,
        template: { ...style.template },
        fontSizePx: overrides.fontSizePx ?? style.fontSizePx,
        durationMs: overrides.durationMs ?? style.durationMs,
    };
}

export function hexToRgbTriplet(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

export function cssVarsFor(style: AlertStyle): Record<string, string> {
    return {
        "--alert-accent": style.accent,
        "--alert-bg-rgb": hexToRgbTriplet(style.bg),
        "--alert-bg-opacity": String(style.bgOpacity),
        "--alert-text": style.textColor,
        "--alert-font-size": `${Math.round(style.fontSizePx * style.cardScale)}px`,
        "--alert-fade-in": `${Math.max(style.fadeInMs, 10)}ms`,
        "--alert-fade-out": `${Math.max(style.fadeOutMs, 10)}ms`,
    };
}

export function substituteTemplate(tpl: string, name: string, viewers: number): string {
    return tpl.split("{name}").join(name).split("{viewers}").join(String(viewers));
}
