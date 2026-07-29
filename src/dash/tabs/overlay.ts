import type { AccountSettings } from "../../api.ts";
import { getMe, authFetch } from "../core.ts";

const PREVIEW_DEBOUNCE_MS = 300;

let previewTimer: number | null = null;
let followPreviewTimer: number | null = null;
let followToken: string | null = null;

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

function setBackdrop(frameId: string, checkerId: string, darkId: string, mode: "checker" | "dark"): void {
    const frame = el(frameId);
    frame.classList.toggle("bg-checker", mode === "checker");
    frame.classList.toggle("bg-dark", mode === "dark");
    el(checkerId).classList.toggle("btn-primary", mode === "checker");
    el(darkId).classList.toggle("btn-primary", mode === "dark");
}

function wireCopy(buttonId: string, sourceId: string): void {
    el<HTMLButtonElement>(buttonId).addEventListener("click", () => {
        const btn = el<HTMLButtonElement>(buttonId);
        navigator.clipboard.writeText(el(sourceId).textContent ?? "").then(() => {
            btn.textContent = "Copied";
            setTimeout(() => { btn.textContent = "Copy"; }, 1200);
        }).catch(() => { btn.textContent = "Failed"; });
    });
}

function buildFollowParams(): URLSearchParams {
    const params = new URLSearchParams();
    const size = el<HTMLSelectElement>("fa-size").value;
    if (size !== "m") params.set("size", size);
    const duration = Number(el<HTMLInputElement>("fa-duration").value);
    if (Number.isFinite(duration) && duration > 0 && duration !== 5) params.set("duration", String(duration));
    return params;
}

function updateFollowUrl(): void {
    const params = buildFollowParams();
    if (!followToken) {
        el("fa-url").textContent = "Generate a token to get your overlay URL.";
        return;
    }
    params.set("token", followToken);
    el("fa-url").textContent = `${location.origin}/alerts/${username()}?${params.toString()}`;
}

function updateFollowPreview(): void {
    followPreviewTimer = null;
    const params = buildFollowParams();
    params.set("demo", "1");
    el<HTMLIFrameElement>("fa-preview-iframe").src = `/alerts/${username()}?${params.toString()}`;
}

function scheduleFollowPreview(): void {
    if (followPreviewTimer !== null) window.clearTimeout(followPreviewTimer);
    followPreviewTimer = window.setTimeout(updateFollowPreview, PREVIEW_DEBOUNCE_MS);
}

function onFollowChange(): void {
    updateFollowUrl();
    scheduleFollowPreview();
}

function renderFollowToken(): void {
    el<HTMLButtonElement>("fa-token-btn").textContent = followToken ? "Rotate" : "Generate";
    updateFollowUrl();
}

async function loadFollowToken(): Promise<void> {
    try {
        const s = await authFetch<AccountSettings>("/api/settings");
        followToken = typeof s.overlayToken === "string" ? s.overlayToken : null;
    } catch {
        followToken = null;
    }
    renderFollowToken();
}

async function rotateFollowToken(): Promise<void> {
    if (followToken && !confirm("Rotate the follow alert overlay token? The current overlay URL stops working immediately.")) return;
    const btn = el<HTMLButtonElement>("fa-token-btn");
    btn.disabled = true;
    try {
        const res = await authFetch<{ overlayToken: string }>("/api/settings/overlay-token/rotate", { method: "POST" });
        followToken = res.overlayToken;
        renderFollowToken();
    } catch (e) {
        alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    }
    btn.disabled = false;
}

export function init(): void {
    el("ov-bg-checker").addEventListener("click", () => setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "checker"));
    el("ov-bg-dark").addEventListener("click", () => setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "dark"));
    wireCopy("ov-url-copy", "ov-url");

    for (const id of ["ov-size", "ov-fade", "ov-badges", "ov-emotes", "ov-bg", "ov-shadow", "ov-align"]) {
        el(id).addEventListener("input", onChange);
    }

    el("fa-bg-checker").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker"));
    el("fa-bg-dark").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "dark"));
    wireCopy("fa-url-copy", "fa-url");
    el("fa-token-btn").addEventListener("click", () => void rotateFollowToken());

    for (const id of ["fa-size", "fa-duration"]) {
        el(id).addEventListener("input", onFollowChange);
    }
}

export function activate(): void {
    setBackdrop("ov-preview-frame", "ov-bg-checker", "ov-bg-dark", "checker");
    updateUrl();
    updatePreview();

    setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker");
    updateFollowUrl();
    updateFollowPreview();
    void loadFollowToken();
}

export function deactivate(): void {
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }
    el<HTMLIFrameElement>("ov-preview-iframe").src = "about:blank";

    if (followPreviewTimer !== null) {
        window.clearTimeout(followPreviewTimer);
        followPreviewTimer = null;
    }
    el<HTMLIFrameElement>("fa-preview-iframe").src = "about:blank";
}
