import { readLocalStorage, writeLocalStorage } from "./storage.ts";

export interface AccentTheme {
    id: string;
    label: string;
    swatch: string;
    favicon?: string;
    touchIcon?: string;
}

export const ACCENT_STORAGE_KEY = "site_accent";
export const DEFAULT_ACCENT = "malachite";
export const ACCENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const ACCENT_THEMES: readonly AccentTheme[] = [
    { id: "malachite", label: "Malachite", swatch: "#4ade80", favicon: "/static/img/favicon.png", touchIcon: "/static/img/icon.png" },
    { id: "verdigris", label: "Verdigris", swatch: "#14e0c8" },
    { id: "lagoon", label: "Lagoon", swatch: "#22d3ee" },
    { id: "aquamarine", label: "Aquamarine", swatch: "#67e8f9" },
    { id: "beacon", label: "Beacon", swatch: "#38bdf8", favicon: "/static/img/favicon-beacon.png", touchIcon: "/static/img/icon-beacon.png" },
    { id: "glacier", label: "Glacier", swatch: "#7dd3fc" },
    { id: "azurite", label: "Azurite", swatch: "#60a5fa" },
    { id: "cornflower", label: "Cornflower", swatch: "#7ba0ff" },
    { id: "iris", label: "Iris", swatch: "#a5b4fc" },
    { id: "amethyst", label: "Amethyst", swatch: "#a78bfa" },
    { id: "wisteria", label: "Wisteria", swatch: "#c4b5fd" },
    { id: "orchid", label: "Orchid", swatch: "#e879f9" },
    { id: "fuchsite", label: "Fuchsite", swatch: "#f0abfc" },
    { id: "moonstone", label: "Moonstone", swatch: "#cbd5e1" },
];

export function normalizeAccent(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_ACCENT;
    const id = value.trim().toLowerCase();
    return ACCENT_THEMES.some(t => t.id === id) ? id : DEFAULT_ACCENT;
}

export function accentLabel(id: string): string {
    const theme = ACCENT_THEMES.find(t => t.id === normalizeAccent(id));
    return theme ? theme.label : "";
}

export function accentIcons(id: string): { favicon: string; touchIcon: string } {
    const theme = ACCENT_THEMES.find(t => t.id === normalizeAccent(id));
    if (theme?.favicon && theme?.touchIcon) return { favicon: theme.favicon, touchIcon: theme.touchIcon };
    const fallback = ACCENT_THEMES.find(t => t.id === DEFAULT_ACCENT)!;
    return { favicon: fallback.favicon!, touchIcon: fallback.touchIcon! };
}

export function isIpAddress(hostname: string): boolean {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
    return hostname.includes(":");
}

export function candidateCookieDomains(hostname: string): string[] {
    if (!hostname || hostname === "localhost" || isIpAddress(hostname)) return [];
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length < 2) return [];
    const candidates: string[] = [];
    for (let i = labels.length - 2; i >= 0; i--) {
        candidates.push(labels.slice(i).join("."));
    }
    return candidates;
}

export function parseCookie(cookieString: string, name: string): string | null {
    const pattern = new RegExp(`(?:^|; )${name}=([^;]*)`);
    const match = pattern.exec(cookieString);
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]!);
    } catch {
        return match[1]!;
    }
}

export function buildCookieAttributes(opts: { maxAgeSeconds: number; domain?: string; secure: boolean }): string {
    let attrs = `Path=/; Max-Age=${opts.maxAgeSeconds}; SameSite=Lax`;
    if (opts.domain) attrs += `; Domain=${opts.domain}`;
    if (opts.secure) attrs += "; Secure";
    return attrs;
}

export function resolveStoredAccent(
    cookieValue: string | null,
    localValue: string | null,
): { accent: string; shouldMigrate: boolean } {
    if (cookieValue !== null) return { accent: normalizeAccent(cookieValue), shouldMigrate: false };
    if (localValue !== null) return { accent: normalizeAccent(localValue), shouldMigrate: true };
    return { accent: DEFAULT_ACCENT, shouldMigrate: false };
}

function accentIconMapLiteral(): string {
    const entries = ACCENT_THEMES
        .filter(t => t.id !== DEFAULT_ACCENT && t.favicon && t.touchIcon)
        .map(t => `${JSON.stringify(t.id)}:${JSON.stringify([t.favicon, t.touchIcon])}`);
    return `{${entries.join(",")}}`;
}

export function renderPrePaintSnippet(): string {
    const key = JSON.stringify(ACCENT_STORAGE_KEY);
    const fallback = JSON.stringify(DEFAULT_ACCENT);
    const map = accentIconMapLiteral();
    return `<script>try{var c=document.cookie.match(/(?:^|; )${ACCENT_STORAGE_KEY}=([^;]*)/);var a=c?decodeURIComponent(c[1]):localStorage.getItem(${key});if(a&&a!==${fallback}){document.documentElement.setAttribute("data-accent",a);var m=${map}[a];if(m){var i=document.querySelector('link[rel="icon"]');if(i)i.href=m[0];var t=document.querySelector('link[rel="apple-touch-icon"]');if(t)t.href=m[1]}}}catch(e){}</script>`;
}

function cookieIsSecure(): boolean {
    return typeof location !== "undefined" && location.protocol === "https:";
}

function readDocumentCookie(): string {
    try {
        return document.cookie;
    } catch {
        return "";
    }
}

function writeDocumentCookie(value: string): void {
    try {
        document.cookie = value;
    } catch {}
}

export function readAccentCookie(): string | null {
    return parseCookie(readDocumentCookie(), ACCENT_STORAGE_KEY);
}

function clearHostOnlyAccentCookie(): void {
    writeDocumentCookie(`${ACCENT_STORAGE_KEY}=; ${buildCookieAttributes({ maxAgeSeconds: 0, secure: cookieIsSecure() })}`);
}

function attemptDomainCookie(value: string, domain: string): boolean {
    const attrs = buildCookieAttributes({ maxAgeSeconds: ACCENT_COOKIE_MAX_AGE_SECONDS, domain, secure: cookieIsSecure() });
    writeDocumentCookie(`${ACCENT_STORAGE_KEY}=${encodeURIComponent(value)}; ${attrs}`);
    return readAccentCookie() === value;
}

export function writeAccentCookie(id: string): void {
    const value = normalizeAccent(id);
    clearHostOnlyAccentCookie();
    const hostname = typeof location !== "undefined" ? location.hostname : "";
    for (const domain of candidateCookieDomains(hostname)) {
        if (attemptDomainCookie(value, domain)) return;
    }
    const attrs = buildCookieAttributes({ maxAgeSeconds: ACCENT_COOKIE_MAX_AGE_SECONDS, secure: cookieIsSecure() });
    writeDocumentCookie(`${ACCENT_STORAGE_KEY}=${encodeURIComponent(value)}; ${attrs}`);
}

export function readAccent(): string {
    const cookie = readAccentCookie();
    if (cookie !== null) return normalizeAccent(cookie);
    return normalizeAccent(readLocalStorage(ACCENT_STORAGE_KEY));
}

export function applyAccent(id: string): void {
    const accent = normalizeAccent(id);
    const root = document.documentElement;
    if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", accent);
    const { favicon, touchIcon } = accentIcons(accent);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = favicon;
    const touchIconEl = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (touchIconEl) touchIconEl.href = touchIcon;
}

export function setAccent(id: string): string {
    const accent = normalizeAccent(id);
    writeLocalStorage(ACCENT_STORAGE_KEY, accent);
    writeAccentCookie(accent);
    applyAccent(accent);
    return accent;
}

export function syncAccent(): string {
    const { accent, shouldMigrate } = resolveStoredAccent(readAccentCookie(), readLocalStorage(ACCENT_STORAGE_KEY));
    writeLocalStorage(ACCENT_STORAGE_KEY, accent);
    if (shouldMigrate) writeAccentCookie(accent);
    applyAccent(accent);
    return accent;
}
