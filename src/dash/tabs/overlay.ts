import { getMe } from "../core.ts";

const PREVIEW_DEBOUNCE_MS = 300;

let previewTimer: number | null = null;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function username(): string {
    return getMe()?.username ?? "demo";
}

function buildOptionParams(): URLSearchParams {
    const params = new URLSearchParams();
    const size = el<HTMLSelectElement>("ov-size").value;
    if (size !== "m") params.set("size", size);
    const fade = Number(el<HTMLInputElement>("ov-fade").value);
    if (Number.isFinite(fade) && fade > 0) params.set("fade", String(fade));
    if (!el<HTMLInputElement>("ov-badges").checked) params.set("badges", "0");
    if (!el<HTMLInputElement>("ov-emotes").checked) params.set("emotes", "0");
    if (el<HTMLInputElement>("ov-bg").checked) params.set("bg", "1");
    if (!el<HTMLInputElement>("ov-shadow").checked) params.set("shadow", "0");
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
    updateUrl();
    schedulePreview();
}

function setBackdrop(mode: "checker" | "dark"): void {
    const frame = el("ov-preview-frame");
    frame.classList.toggle("bg-checker", mode === "checker");
    frame.classList.toggle("bg-dark", mode === "dark");
    el("ov-bg-checker").classList.toggle("btn-primary", mode === "checker");
    el("ov-bg-dark").classList.toggle("btn-primary", mode === "dark");
}

export function init(): void {
    el("ov-bg-checker").addEventListener("click", () => setBackdrop("checker"));
    el("ov-bg-dark").addEventListener("click", () => setBackdrop("dark"));

    el<HTMLButtonElement>("ov-url-copy").addEventListener("click", () => {
        const btn = el<HTMLButtonElement>("ov-url-copy");
        navigator.clipboard.writeText(el("ov-url").textContent ?? "").then(() => {
            btn.textContent = "Copied";
            setTimeout(() => { btn.textContent = "Copy"; }, 1200);
        }).catch(() => { btn.textContent = "Failed"; });
    });

    for (const id of ["ov-size", "ov-fade", "ov-badges", "ov-emotes", "ov-bg", "ov-shadow", "ov-align"]) {
        el(id).addEventListener("input", onChange);
    }
}

export function activate(): void {
    setBackdrop("checker");
    updateUrl();
    updatePreview();
}
