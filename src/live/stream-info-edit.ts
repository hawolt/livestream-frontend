import { API_BASE } from "../api.ts";
import { viewerOwnsChannel } from "./points.ts";
import { applyChannelChrome, type ChannelChrome } from "./channel-chrome.ts";
import { channelPageTitle } from "./page-title.ts";
import { ctx } from "./player/context.ts";
import { attachTypeahead, type TypeaheadHandle, type TypeaheadOption } from "../typeahead.ts";
import { STREAM_LANGUAGE_OPTIONS, streamLanguageCodes } from "../stream-languages.ts";
import { joinStreamInfoLanguages, validateStreamInfoForm } from "./stream-info-form.ts";
import { openDismissibleSurface, closeDismissibleSurface } from "../dismissible-surface.ts";
import {
    editInfoBtnEl,
    streamInfoModalEl,
    streamInfoModalCloseEl,
    streamInfoModalFormEl,
    streamInfoTitleInputEl,
    streamInfoCategoryInputEl,
    streamInfoLanguageInputEl,
    streamInfoLanguage2InputEl,
    streamInfoModalErrorEl,
    streamInfoModalSubmitEl,
} from "./dom.ts";

let ownerChannel = "";
let isOwner = false;
let sessionToken = "";
let current: ChannelChrome = { title: "", category: "", categoryId: null, language: "und" };
let wired = false;
let categoryField: TypeaheadHandle | null = null;
let languageField: TypeaheadHandle | null = null;
let language2Field: TypeaheadHandle | null = null;

function closeModal(): void {
    if (streamInfoModalEl.hidden) return;
    streamInfoModalEl.hidden = true;
    closeDismissibleSurface(streamInfoModalEl);
}

async function fetchCategories(): Promise<TypeaheadOption[]> {
    try {
        const res = await fetch(`${API_BASE}/live/categories`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (!res.ok) return [];
        const data = await res.json() as { categories?: { id: number; name: string }[] };
        const list = Array.isArray(data.categories) ? data.categories : [];
        return list.map((c) => ({ value: String(c.id), label: c.name }));
    } catch {
        return [];
    }
}

function openModal(): void {
    if (!isOwner || !categoryField || !languageField || !language2Field) return;
    streamInfoModalErrorEl.textContent = "";
    streamInfoModalSubmitEl.disabled = false;
    streamInfoTitleInputEl.value = current.title;
    categoryField.setValue(current.categoryId === null ? "" : String(current.categoryId));
    const codes = streamLanguageCodes(current.language);
    languageField.setValue(codes[0] ?? "und");
    language2Field.setValue(codes[1] ?? "und");
    streamInfoModalEl.hidden = false;
    openDismissibleSurface(streamInfoModalEl, closeModal);
    streamInfoTitleInputEl.focus();
}

async function submitForm(): Promise<void> {
    if (!categoryField || !languageField || !language2Field) return;
    const catValue = categoryField.value();
    const validated = validateStreamInfoForm({
        title: streamInfoTitleInputEl.value,
        categoryId: catValue === "" ? null : Number(catValue),
        language: joinStreamInfoLanguages(languageField.value(), language2Field.value()),
    });
    if (!validated.ok) {
        streamInfoModalErrorEl.textContent = validated.error;
        return;
    }
    streamInfoModalErrorEl.textContent = "";
    streamInfoModalSubmitEl.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/live/info`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(validated.payload),
        });
        const data = await res.json().catch(() => ({})) as Partial<ChannelChrome> & { error?: string };
        if (!res.ok) {
            streamInfoModalErrorEl.textContent = data.error && data.error.trim() ? data.error : "Could not save stream info.";
            streamInfoModalSubmitEl.disabled = false;
            return;
        }
        current = {
            title: typeof data.title === "string" ? data.title : "",
            category: typeof data.category === "string" ? data.category : "",
            categoryId: typeof data.categoryId === "number" ? data.categoryId : null,
            language: typeof data.language === "string" ? data.language : "und",
        };
        applyChannelChrome(current);
        document.title = channelPageTitle(ctx.displayUsername, current.title);
        closeModal();
    } catch {
        streamInfoModalErrorEl.textContent = "Could not reach the server. Try again.";
        streamInfoModalSubmitEl.disabled = false;
    }
}

function wireOnce(categoryOptions: TypeaheadOption[]): void {
    if (wired) return;
    wired = true;
    categoryField = attachTypeahead(streamInfoCategoryInputEl, [{ value: "", label: "Other (no category)" }, ...categoryOptions]);
    languageField = attachTypeahead(streamInfoLanguageInputEl, STREAM_LANGUAGE_OPTIONS.map(({ code, label }) => ({ value: code, label })));
    language2Field = attachTypeahead(streamInfoLanguage2InputEl, STREAM_LANGUAGE_OPTIONS.map(({ code, label }) =>
        ({ value: code, label: code === "und" ? "None" : label })));
    editInfoBtnEl.addEventListener("click", openModal);
    streamInfoModalCloseEl.addEventListener("click", closeModal);
    streamInfoModalEl.addEventListener("click", (e) => {
        if (e.target === streamInfoModalEl) closeModal();
    });
    streamInfoModalFormEl.addEventListener("submit", (e) => {
        e.preventDefault();
        void submitForm();
    });
}

export function initStreamInfoEdit(channel: string, initial: ChannelChrome): void {
    ownerChannel = channel.toLowerCase();
    isOwner = false;
    sessionToken = "";
    current = initial;
    editInfoBtnEl.classList.add("hidden");
    void (async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
            if (!res.ok) return;
            const info = (await res.json()) as { kind?: unknown; username?: unknown; token?: unknown } | null;
            if (ownerChannel !== channel.toLowerCase()) return;
            if (!viewerOwnsChannel(info, ownerChannel) || typeof info?.token !== "string" || !info.token) return;
            isOwner = true;
            sessionToken = info.token;
            const categoryOptions = await fetchCategories();
            if (ownerChannel !== channel.toLowerCase() || !isOwner) return;
            wireOnce(categoryOptions);
            editInfoBtnEl.classList.remove("hidden");
        } catch {}
    })();
}

export function syncStreamInfoState(frame: ChannelChrome): void {
    if (!isOwner) return;
    current = frame;
}
