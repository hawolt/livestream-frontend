import { categoryEl, languageEl, languageSepEl, nameEl, titleEl } from "./dom.ts";
import { streamLanguageLabel } from "../stream-languages.ts";

export function setChannelName(display: string, username: string | null): void {
    nameEl.textContent = display;
    if (username) nameEl.href = `/${encodeURIComponent(username)}`;
    else nameEl.removeAttribute("href");
}

export interface ChannelChrome {
    title: string;
    category: string;
    categoryId: number | null;
    language: string;
}

export function applyChannelChrome(c: ChannelChrome): void {
    titleEl.textContent = c.title;
    const hasCategory = !!c.category;
    const languageLabel = streamLanguageLabel(c.language);
    const hasLanguage = languageLabel !== null;
    categoryEl.textContent = c.category;
    if (c.categoryId !== null && hasCategory) categoryEl.href = `/category/${encodeURIComponent(c.category)}`;
    else if (c.categoryId !== null) categoryEl.href = `/?category=${c.categoryId}`;
    else categoryEl.removeAttribute("href");
    categoryEl.classList.toggle("hidden", !hasCategory);
    languageEl.textContent = languageLabel ?? "";
    languageEl.classList.toggle("hidden", !hasLanguage);
    languageSepEl.classList.toggle("hidden", !hasLanguage || !hasCategory);
    languageEl.title = languageLabel ? `Stream language: ${languageLabel}` : "";
}
