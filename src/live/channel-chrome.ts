import { categoryEl, categorySepEl, languageEl, languageSepEl, sepEl, titleEl } from "./dom.ts";
import { streamLanguageLabel } from "../stream-languages.ts";

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
    sepEl.classList.toggle("hidden", !c.title && !hasCategory && !hasLanguage);
    categoryEl.textContent = c.category;
    if (c.categoryId !== null && hasCategory) categoryEl.href = `/category/${encodeURIComponent(c.category)}`;
    else if (c.categoryId !== null) categoryEl.href = `/?category=${c.categoryId}`;
    else categoryEl.removeAttribute("href");
    categoryEl.classList.toggle("hidden", !hasCategory);
    categorySepEl.classList.toggle("hidden", !c.title || !hasCategory);
    languageEl.textContent = languageLabel ?? "";
    languageEl.classList.toggle("hidden", !hasLanguage);
    languageSepEl.classList.toggle("hidden", !hasLanguage || (!c.title && !hasCategory));
    languageEl.title = languageLabel ? `Stream language: ${languageLabel}` : "";
}
