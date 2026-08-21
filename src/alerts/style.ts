export type AlertPreset = "classic" | "minimal" | "banner";
export type AlertAnimation = "pop" | "slide" | "fade" | "drop" | "zoom";

export interface AlertStyle {
    preset: AlertPreset;
    animation: AlertAnimation;
    accent: string;
    bg: string;
    bgOpacity: number;
    textColor: string;
    fontSizePx: number;
    cardScale: number;
    durationMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    redeemAlerts: boolean;
    template: { follow: string; raid: string; redeem: string };
}

export const DEFAULT_ALERT_STYLE: AlertStyle = {
    preset: "classic",
    animation: "pop",
    accent: "#ffd76a",
    bg: "#14121e",
    bgOpacity: 0.85,
    textColor: "#ffffff",
    fontSizePx: 22,
    cardScale: 1,
    durationMs: 5000,
    fadeInMs: 500,
    fadeOutMs: 350,
    redeemAlerts: true,
    template: {
        follow: "{name}{linebreak}just followed!",
        raid: "{name}{linebreak}just raided with {viewers} viewers!",
        redeem: "{name}{linebreak}redeemed {reward}",
    },
};

const PRESETS: readonly AlertPreset[] = ["classic", "minimal", "banner"];
const ANIMATIONS: readonly AlertAnimation[] = ["pop", "slide", "fade", "drop", "zoom"];
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
    const animation = ANIMATIONS.includes(o.animation as AlertAnimation) ? o.animation as AlertAnimation : d.animation;
    return {
        preset,
        animation,
        accent: color(o.accent, d.accent),
        bg: color(o.bg, d.bg),
        bgOpacity: clampNum(o.bgOpacity, d.bgOpacity, 0, 1),
        textColor: color(o.textColor, d.textColor),
        fontSizePx: clampNum(o.fontSizePx, d.fontSizePx, 10, 96),
        cardScale: clampNum(o.cardScale, d.cardScale, 0.5, 2),
        durationMs: clampNum(o.durationMs, d.durationMs, 1000, 30000),
        fadeInMs: clampNum(o.fadeInMs, d.fadeInMs, 0, 5000),
        fadeOutMs: clampNum(o.fadeOutMs, d.fadeOutMs, 0, 5000),
        redeemAlerts: typeof o.redeemAlerts === "boolean" ? o.redeemAlerts : d.redeemAlerts,
        template: {
            follow: template(t.follow, d.template.follow),
            raid: template(t.raid, d.template.raid),
            redeem: template(t.redeem, d.template.redeem),
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

export function substituteTemplate(tpl: string, name: string, viewers: number, reward = "", message = ""): string {
    return tpl.split("{name}").join(name)
        .split("{viewers}").join(String(viewers))
        .split("{reward}").join(reward)
        .split("{message}").join(message)
        .split("{linebreak}").join("\n");
}

export type TemplateToken =
    | { kind: "text"; value: string }
    | { kind: "name"; value: string }
    | { kind: "viewers"; value: string }
    | { kind: "reward"; value: string }
    | { kind: "message"; value: string }
    | { kind: "break" };

export function tokenizeTemplate(tpl: string, name: string, viewers: number, reward = "", message = ""): TemplateToken[] {
    const tokens: TemplateToken[] = [];
    const parts = tpl.split(/(\{name\}|\{viewers\}|\{reward\}|\{message\}|\{linebreak\})/g);
    for (const part of parts) {
        if (part === "{name}") {
            tokens.push({ kind: "name", value: name });
        } else if (part === "{viewers}") {
            tokens.push({ kind: "viewers", value: String(viewers) });
        } else if (part === "{reward}") {
            tokens.push({ kind: "reward", value: reward });
        } else if (part === "{message}") {
            if (message !== "") tokens.push({ kind: "message", value: message });
        } else if (part === "{linebreak}") {
            tokens.push({ kind: "break" });
        } else if (part !== "") {
            tokens.push({ kind: "text", value: part });
        }
    }
    return tokens;
}

export function templateHasName(tpl: string): boolean {
    return tpl.includes("{name}");
}
