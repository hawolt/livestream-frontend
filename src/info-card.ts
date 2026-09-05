import type { LiveInfo, LiveCategory } from "./api.ts";
import { STREAM_LANGUAGE_OPTIONS, streamLanguageCodes } from "./stream-languages.ts";
import { attachTypeahead, type TypeaheadOption } from "./typeahead.ts";
import { esc } from "./dash/format.ts";
import { authFetch, loadDashboardSession, setMe, startSessionRenewal } from "./dash/session.ts";

const root = document.getElementById("info-dock") as HTMLElement;

let liveCache: LiveInfo | null = null;
let categoriesCache: LiveCategory[] = [];

function showMessage(html: string): void {
    root.innerHTML = `<div class="card">${html}</div>`;
}

function renderEditor(): void {
    if (!liveCache) return;
    const currentCodes = streamLanguageCodes(liveCache.language);
    const primaryCode = currentCodes[0] ?? "und";
    const secondaryCode = currentCodes[1] ?? "und";
    root.innerHTML = `
        <div class="card">
            <div class="section-title">Stream info</div>
            <div class="form-grid">
                <label class="span2"><span>Title</span><input id="info-title" type="text" maxlength="200" placeholder="Now streaming..." value="${esc(liveCache.title)}"></label>
                <label><span>Category</span><input id="info-category" type="text" placeholder="Other (no category)"></label>
                <label><span>Language</span><input id="info-language" type="text" placeholder="Unspecified"></label>
                <label><span>Second language</span><input id="info-language2" type="text" placeholder="None"></label>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px">
                Shown with your stream on the channel page and explorer. Categories are also used to group streams.
            </div>
            <div id="info-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>
            <div class="card-actions" style="align-items:center">
                <button class="btn btn-primary" id="info-save">Save Stream Info</button>
                <span id="info-saved" style="font-size:13px;color:var(--success)"></span>
            </div>
        </div>`;

    const categoryOptions: TypeaheadOption[] = [{ value: "", label: "Other (no category)" }]
        .concat(categoriesCache.map(c => ({ value: String(c.id), label: c.name })));
    const categoryField = attachTypeahead(
        document.getElementById("info-category") as HTMLInputElement, categoryOptions);
    categoryField.setValue(liveCache.categoryId === null ? "" : String(liveCache.categoryId));

    const primaryOptions: TypeaheadOption[] = STREAM_LANGUAGE_OPTIONS.map(({ code, label }) => ({ value: code, label }));
    const secondaryOptions: TypeaheadOption[] = STREAM_LANGUAGE_OPTIONS.map(({ code, label }) =>
        ({ value: code, label: code === "und" ? "None" : label }));
    const primaryField = attachTypeahead(
        document.getElementById("info-language") as HTMLInputElement, primaryOptions);
    primaryField.setValue(primaryCode);
    const secondaryField = attachTypeahead(
        document.getElementById("info-language2") as HTMLInputElement, secondaryOptions);
    secondaryField.setValue(secondaryCode);

    document.getElementById("info-save")?.addEventListener("click", async () => {
        if (!liveCache) return;
        const btn = document.getElementById("info-save") as HTMLButtonElement;
        const errEl = document.getElementById("info-error")!;
        const savedEl = document.getElementById("info-saved")!;
        const title = (document.getElementById("info-title") as HTMLInputElement).value;
        const catVal = categoryField.value();
        const categoryId = catVal === "" ? null : Number(catVal);
        const codes = [primaryField.value(), secondaryField.value()]
            .filter((code, i, all) => code !== "und" && all.indexOf(code) === i);
        const language = codes.length ? codes.join(",") : "und";
        errEl.textContent = "";
        savedEl.textContent = "";
        btn.disabled = true;
        try {
            liveCache = await authFetch<LiveInfo>("/api/live/info", {
                method: "PUT",
                body: JSON.stringify({ title, categoryId, language }),
            });
            renderEditor();
            const savedNow = document.getElementById("info-saved");
            if (savedNow) {
                savedNow.textContent = "Saved";
                setTimeout(() => { savedNow.textContent = ""; }, 2500);
            }
        } catch (e) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            btn.disabled = false;
        }
    });
}

async function loadEditor(): Promise<void> {
    try {
        const [info, cats] = await Promise.all([
            authFetch<LiveInfo>("/api/live"),
            authFetch<{ categories: LiveCategory[] }>("/api/live/categories"),
        ]);
        liveCache = info;
        categoriesCache = cats.categories;
        renderEditor();
    } catch (e) {
        showMessage(`<div style="color:var(--red)">${esc(e instanceof Error ? e.message : String(e))}</div>`);
    }
}

async function boot(): Promise<void> {
    showMessage("Loading...");
    const session = await loadDashboardSession();
    if (session.state === "ready") {
        setMe(session.me);
        startSessionRenewal();
        void loadEditor();
        return;
    }
    if (session.state === "unavailable") {
        showMessage("Dashboard is temporarily unavailable. This panel retries when you reload.");
        return;
    }
    const returnTo = encodeURIComponent(location.pathname);
    showMessage(`<div class="section-title">Log in to edit your stream info</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px">This panel stays signed in after you log in once.</div>
        <a class="btn btn-primary" href="/login?return=${returnTo}">Log in</a>`);
}

void boot();
