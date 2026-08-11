import { PREVIEW_DEBOUNCE_MS, el, username, setBackdrop, wireCopy } from "../overlay-shared.ts";
import { wireStepper } from "../stepper.ts";

const STORAGE_KEY = "multichat_sources";

let previewTimer: number | null = null;

function cleanName(value: string, pattern: RegExp): string {
    const v = value.trim().replace(/^[@#]/, "");
    return pattern.test(v) ? v : "";
}

function sourceValues(): { twitch: string; youtube: string; ytvideo: string; kick: string; tiktok: string } {
    return {
        twitch: cleanName(el<HTMLInputElement>("mc-twitch").value, /^[A-Za-z0-9_]{3,32}$/),
        youtube: cleanName(el<HTMLInputElement>("mc-youtube").value, /^[A-Za-z0-9._-]{3,30}$/),
        ytvideo: cleanName(el<HTMLInputElement>("mc-ytvideo").value, /^[A-Za-z0-9_-]{11}$/),
        kick: cleanName(el<HTMLInputElement>("mc-kick").value, /^[A-Za-z0-9_-]{3,30}$/),
        tiktok: cleanName(el<HTMLInputElement>("mc-tiktok").value, /^[A-Za-z0-9._]{2,30}$/),
    };
}

function loadStored(): void {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data: any = JSON.parse(raw);
        for (const [key, id] of [["twitch", "mc-twitch"], ["youtube", "mc-youtube"], ["ytvideo", "mc-ytvideo"], ["kick", "mc-kick"], ["tiktok", "mc-tiktok"]] as const) {
            if (typeof data?.[key] === "string") el<HTMLInputElement>(id).value = data[key];
        }
    } catch {}
}

function persist(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            twitch: el<HTMLInputElement>("mc-twitch").value.trim(),
            youtube: el<HTMLInputElement>("mc-youtube").value.trim(),
            ytvideo: el<HTMLInputElement>("mc-ytvideo").value.trim(),
            kick: el<HTMLInputElement>("mc-kick").value.trim(),
            tiktok: el<HTMLInputElement>("mc-tiktok").value.trim(),
        }));
    } catch {}
}

function buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("channel", username());
    const sources = sourceValues();
    if (sources.twitch) params.set("twitch", sources.twitch);
    if (sources.ytvideo) params.set("ytvideo", sources.ytvideo);
    else if (sources.youtube) params.set("youtube", sources.youtube);
    if (sources.kick) params.set("kick", sources.kick);
    if (sources.tiktok) params.set("tiktok", sources.tiktok);

    if (el<HTMLSelectElement>("mc-mode").value === "overlay") params.set("overlay", "1");
    const size = el<HTMLSelectElement>("mc-size").value;
    if (size !== "m") params.set("size", size);
    const fade = Number(el<HTMLInputElement>("mc-fade").value);
    if (Number.isFinite(fade) && fade > 0) params.set("fade", String(fade));
    if (!el<HTMLInputElement>("mc-icons").checked) params.set("icons", "0");
    if (!el<HTMLInputElement>("mc-badges").checked) params.set("badges", "0");
    if (!el<HTMLInputElement>("mc-emotes").checked) params.set("emotes", "0");
    if (el<HTMLInputElement>("mc-linebg").checked) params.set("bg", "1");
    if (!el<HTMLInputElement>("mc-shadow").checked) params.set("shadow", "0");
    return params;
}

function currentUrl(): string {
    return `${location.origin}/multichat?${buildParams().toString()}`;
}

function updateUrl(): void {
    el("mc-url").textContent = currentUrl();
}

function updatePreview(): void {
    previewTimer = null;
    const params = buildParams();
    params.set("demo", "1");
    el<HTMLIFrameElement>("mc-preview-iframe").src = `/multichat?${params.toString()}`;
}

function schedulePreview(): void {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
}

function onChange(): void {
    persist();
    updateUrl();
    schedulePreview();
}

export function init(): void {
    loadStored();
    el("mc-bg-checker").addEventListener("click", () => setBackdrop("mc-preview-frame", "mc-bg-checker", "mc-bg-dark", "checker"));
    el("mc-bg-dark").addEventListener("click", () => setBackdrop("mc-preview-frame", "mc-bg-checker", "mc-bg-dark", "dark"));
    wireCopy("mc-url-copy", () => el("mc-url").textContent ?? "");
    el<HTMLButtonElement>("mc-open").addEventListener("click", () => {
        window.open(currentUrl(), "_blank", "noopener,width=420,height=720");
    });

    wireStepper(el<HTMLInputElement>("mc-fade"));

    for (const id of ["mc-twitch", "mc-youtube", "mc-ytvideo", "mc-kick", "mc-tiktok", "mc-mode", "mc-size", "mc-fade", "mc-icons", "mc-badges", "mc-emotes", "mc-linebg", "mc-shadow"]) {
        el(id).addEventListener("input", onChange);
    }
}

export function activate(): void {
    setBackdrop("mc-preview-frame", "mc-bg-checker", "mc-bg-dark", "checker");
    updateUrl();
    updatePreview();
}

export function deactivate(): void {
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }
    el<HTMLIFrameElement>("mc-preview-iframe").src = "about:blank";
}
