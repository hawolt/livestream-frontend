import { readLocalStorage, writeLocalStorage } from "./storage.ts";

export interface AccentTheme {
    id: string;
    label: string;
    swatch: string;
}

export const ACCENT_STORAGE_KEY = "site_accent";
export const DEFAULT_ACCENT = "malachite";

export const ACCENT_THEMES: readonly AccentTheme[] = [
    { id: "malachite", label: "Malachite", swatch: "#4ade80" },
    { id: "beacon", label: "Beacon", swatch: "#38bdf8" },
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

export function readAccent(): string {
    return normalizeAccent(readLocalStorage(ACCENT_STORAGE_KEY));
}

export function applyAccent(id: string): void {
    const accent = normalizeAccent(id);
    const root = document.documentElement;
    if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", accent);
}

export function setAccent(id: string): string {
    const accent = normalizeAccent(id);
    writeLocalStorage(ACCENT_STORAGE_KEY, accent);
    applyAccent(accent);
    return accent;
}
