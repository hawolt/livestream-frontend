import { readLocalStorage, writeLocalStorage } from "./storage.ts";

export interface AccentTheme {
    id: string;
    label: string;
    swatch: string;
    favicon: string;
    touchIcon: string;
}

export const ACCENT_STORAGE_KEY = "site_accent";
export const DEFAULT_ACCENT = "malachite";

export const ACCENT_THEMES: readonly AccentTheme[] = [
    { id: "malachite", label: "Malachite", swatch: "#4ade80", favicon: "/static/img/favicon.png", touchIcon: "/static/img/icon.png" },
    { id: "beacon", label: "Beacon", swatch: "#38bdf8", favicon: "/static/img/favicon-beacon.png", touchIcon: "/static/img/icon-beacon.png" },
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
    const theme = ACCENT_THEMES.find(t => t.id === normalizeAccent(id))!;
    return { favicon: theme.favicon, touchIcon: theme.touchIcon };
}

export function readAccent(): string {
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
    applyAccent(accent);
    return accent;
}
