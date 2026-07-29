import type { AccountSettings } from "../../api.ts";
import { authFetch } from "../core.ts";
import { PREVIEW_DEBOUNCE_MS, el, username, setBackdrop, wireCopy } from "../overlay-shared.ts";

let followPreviewTimer: number | null = null;
let followToken: string | null = null;

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
    el("fa-bg-checker").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker"));
    el("fa-bg-dark").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "dark"));
    wireCopy("fa-url-copy", () => el("fa-url").textContent ?? "");
    el("fa-token-btn").addEventListener("click", () => void rotateFollowToken());

    for (const id of ["fa-size", "fa-duration"]) {
        el(id).addEventListener("input", onFollowChange);
    }
}

export function activate(): void {
    setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker");
    updateFollowUrl();
    updateFollowPreview();
    void loadFollowToken();
}

export function deactivate(): void {
    if (followPreviewTimer !== null) {
        window.clearTimeout(followPreviewTimer);
        followPreviewTimer = null;
    }
    el<HTMLIFrameElement>("fa-preview-iframe").src = "about:blank";
}
