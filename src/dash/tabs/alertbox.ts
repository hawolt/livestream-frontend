import type { AccountSettings } from "../../api.ts";
import { maskSecret } from "../format.ts";
import { authFetch } from "../session.ts";
import { PREVIEW_DEBOUNCE_MS, el, username, setBackdrop, wireCopy } from "../overlay-shared.ts";

let followPreviewTimer: number | null = null;
let followToken: string | null = null;
let revealed = false;
let activationGeneration = 0;
let tokenRevision = 0;
let testRevision = 0;
let active = false;
const pendingTokenWrites = new Set<number>();

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function buildFollowParams(): URLSearchParams {
    const params = new URLSearchParams();
    const size = el<HTMLSelectElement>("fa-size").value;
    if (size !== "m") params.set("size", size);
    const duration = Number(el<HTMLInputElement>("fa-duration").value);
    if (Number.isFinite(duration) && duration > 0 && duration !== 5) params.set("duration", String(duration));
    return params;
}

function followUrl(): string {
    if (!followToken) return "";
    return buildFollowUrl(followToken);
}

function maskedFollowUrl(): string {
    if (!followToken) return "";
    return buildFollowUrl(maskSecret(followToken));
}

function buildFollowUrl(overlayToken: string): string {
    const query = buildFollowParams().toString();
    const fragment = new URLSearchParams({ token: overlayToken }).toString();
    return `${location.origin}/alerts/${username()}${query ? `?${query}` : ""}#${fragment}`;
}

function updateFollowUrl(): void {
    if (!followToken) {
        el("fa-url").textContent = "Loading...";
        return;
    }
    el("fa-url").textContent = revealed ? followUrl() : maskedFollowUrl();
}

function updateFollowPreview(): void {
    followPreviewTimer = null;
    if (!active) return;
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

function setTokenControlsEnabled(enabled: boolean): void {
    el<HTMLButtonElement>("fa-token-btn").disabled = !enabled;
    el<HTMLButtonElement>("fa-url-copy").disabled = !enabled;
    el<HTMLButtonElement>("fa-url-reveal").disabled = !enabled;
}

async function loadFollowToken(generation: number): Promise<void> {
    setTokenControlsEnabled(false);
    if (pendingTokenWrites.size > 0) return;
    const revision = ++tokenRevision;
    try {
        const s = await authFetch<AccountSettings>("/api/settings");
        if (!isCurrentActivation(generation) || revision !== tokenRevision) return;
        followToken = typeof s.overlayToken === "string" ? s.overlayToken : null;
    } catch {
        if (!isCurrentActivation(generation) || revision !== tokenRevision) return;
        followToken = null;
    }
    setTokenControlsEnabled(followToken !== null);
    updateFollowUrl();
}

async function sendTestAlert(): Promise<void> {
    const btn = el<HTMLButtonElement>("fa-test-btn");
    const status = el("fa-test-status");
    const generation = activationGeneration;
    const revision = ++testRevision;
    btn.disabled = true;
    status.textContent = "";
    try {
        await authFetch<void>("/api/follows/test", { method: "POST" });
        if (!isCurrentActivation(generation) || revision !== testRevision) return;
        status.textContent = "Test alert sent";
        status.style.color = "var(--success)";
    } catch (e) {
        if (!isCurrentActivation(generation) || revision !== testRevision) return;
        const code = (e as { status?: number }).status;
        status.textContent = code === 429 ? "Please wait a moment" : "Failed to send test alert";
        status.style.color = code === 429 ? "var(--muted)" : "var(--red)";
    }
    window.setTimeout(() => {
        if (isCurrentActivation(generation) && revision === testRevision) btn.disabled = false;
    }, 2000);
    window.setTimeout(() => {
        if (isCurrentActivation(generation) && revision === testRevision) status.textContent = "";
    }, 4000);
}

async function rotateFollowToken(): Promise<void> {
    if (!confirm("Rotate the follow alert overlay token? The current overlay URL stops working immediately.")) return;
    const btn = el<HTMLButtonElement>("fa-token-btn");
    const generation = activationGeneration;
    const revision = ++tokenRevision;
    pendingTokenWrites.add(revision);
    btn.disabled = true;
    try {
        const res = await authFetch<{ overlayToken: string }>("/api/settings/overlay-token/rotate", { method: "POST" });
        pendingTokenWrites.delete(revision);
        if (isCurrentActivation(generation) && revision === tokenRevision) {
            followToken = res.overlayToken;
            updateFollowUrl();
        } else if (active) {
            void loadFollowToken(activationGeneration);
        }
    } catch (e) {
        pendingTokenWrites.delete(revision);
        if (isCurrentActivation(generation) && revision === tokenRevision) {
            alert("Failed: " + (e instanceof Error ? e.message : String(e)));
        } else if (active) {
            void loadFollowToken(activationGeneration);
        }
    }
    if (isCurrentActivation(generation) && revision === tokenRevision) btn.disabled = false;
}

export function init(): void {
    el("fa-bg-checker").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker"));
    el("fa-bg-dark").addEventListener("click", () => setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "dark"));
    wireCopy("fa-url-copy", () => followUrl());
    el("fa-url-reveal").addEventListener("click", () => {
        revealed = !revealed;
        el<HTMLButtonElement>("fa-url-reveal").textContent = revealed ? "Hide" : "Reveal";
        updateFollowUrl();
    });
    el("fa-token-btn").addEventListener("click", () => void rotateFollowToken());
    el("fa-test-btn").addEventListener("click", () => void sendTestAlert());

    for (const id of ["fa-size", "fa-duration"]) {
        el(id).addEventListener("input", onFollowChange);
    }
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    testRevision += 1;
    el<HTMLButtonElement>("fa-test-btn").disabled = false;
    el("fa-test-status").textContent = "";
    setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker");
    revealed = false;
    el<HTMLButtonElement>("fa-url-reveal").textContent = "Reveal";
    updateFollowUrl();
    updateFollowPreview();
    void loadFollowToken(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    testRevision += 1;
    if (followPreviewTimer !== null) {
        window.clearTimeout(followPreviewTimer);
        followPreviewTimer = null;
    }
    el<HTMLIFrameElement>("fa-preview-iframe").src = "about:blank";
    revealed = false;
}
