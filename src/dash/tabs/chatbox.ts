import { PREVIEW_DEBOUNCE_MS, el, username, setBackdrop, wireCopy } from "../overlay-shared.ts";
import { wireStepper } from "../stepper.ts";

const MIN_SIZE_PX = 10;
const MAX_SIZE_PX = 120;

let previewTimer: number | null = null;

function customSizePx(): number {
    const raw = Number(el<HTMLInputElement>("ov-size-px").value);
    const v = Number.isFinite(raw) ? raw : 48;
    return Math.min(MAX_SIZE_PX, Math.max(MIN_SIZE_PX, Math.round(v)));
}

function syncSizeCustomVisibility(): void {
    el("ov-size-px-wrap").hidden = el<HTMLSelectElement>("ov-size").value !== "custom";
}

function buildOptionParams(): URLSearchParams {
    const params = new URLSearchParams();
    const size = el<HTMLSelectElement>("ov-size").value;
    if (size === "custom") params.set("size", String(customSizePx()));
    else if (size !== "m") params.set("size", size);
    const font = el<HTMLSelectElement>("ov-font").value;
    if (font !== "system") params.set("font", font);
    const weight = el<HTMLSelectElement>("ov-weight").value;
    if (weight !== "default") params.set("weight", weight);
    const fade = Number(el<HTMLInputElement>("ov-fade").value);
    if (Number.isFinite(fade) && fade > 0) params.set("fade", String(fade));
    if (!el<HTMLInputElement>("ov-badges").checked) params.set("badges", "0");
    if (!el<HTMLInputElement>("ov-emotes").checked) params.set("emotes", "0");
    if (el<HTMLInputElement>("ov-bg").checked) params.set("bg", "1");
    const shadow = el<HTMLSelectElement>("ov-shadow").value;
    if (shadow !== "default") params.set("shadow", shadow);
    if (el<HTMLInputElement>("ov-system").checked) params.set("system", "1");
    if (el<HTMLSelectElement>("ov-align").value === "right") params.set("align", "right");
    return params;
}

function updateUrl(): void {
    const qs = buildOptionParams().toString();
    el("ov-url").textContent = `${location.origin}/chat/${username()}${qs ? `?${qs}` : ""}`;
}

function updatePreview(): void {
    previewTimer = null;
    const params = buildOptionParams();
    params.set("demo", "1");
    el<HTMLIFrameElement>("ov-preview-iframe").src = `/chat/${username()}?${params.toString()}`;
}

function schedulePreview(): void {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
}

function onChange(): void {
    syncSizeCustomVisibility();
    updateUrl();
    schedulePreview();
}

export function init(): void {
    el("ov-bg-checker").addEventListener("click", () => setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "checker"));
    el("ov-bg-dark").addEventListener("click", () => setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "dark"));
    wireCopy("ov-url-copy", () => el("ov-url").textContent ?? "");

    wireStepper(el<HTMLInputElement>("ov-fade"));
    wireStepper(el<HTMLInputElement>("ov-size-px"));

    for (const id of ["ov-size", "ov-size-px", "ov-font", "ov-weight", "ov-fade", "ov-badges", "ov-emotes", "ov-bg", "ov-shadow", "ov-system", "ov-align"]) {
        el(id).addEventListener("input", onChange);
    }
}

export function activate(): void {
    setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "checker");
    syncSizeCustomVisibility();
    updateUrl();
    updatePreview();
}

export function deactivate(): void {
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }
    el<HTMLIFrameElement>("ov-preview-iframe").src = "about:blank";
}
