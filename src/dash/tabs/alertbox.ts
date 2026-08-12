import type { AccountSettings } from "../../api.ts";
import { maskSecret } from "../format.ts";
import { authFetch } from "../session.ts";
import { PREVIEW_DEBOUNCE_MS, el, username, setBackdrop, wireCopy } from "../overlay-shared.ts";
import { soundSlotEndpoints, slotHasOwnSound, type AlertSoundSlot } from "../alert-sound-slots.ts";
import { DEFAULT_ALERT_STYLE, parseAlertStyle, type AlertStyle } from "../../alerts/style.ts";
import { wireStepper } from "../stepper.ts";

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

function buildPreviewParams(): URLSearchParams {
    const params = buildFollowParams();
    params.set("demo", "1");
    if (previewMuted) params.set("sound", "0");
    return params;
}

function buildFollowParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (!el<HTMLInputElement>("fa-sound").checked) params.set("sound", "0");
    const volume = Number(el<HTMLInputElement>("fa-volume").value);
    if (Number.isFinite(volume) && volume >= 0 && volume < 100) params.set("volume", String(Math.round(volume)));
    return params;
}

let pendingUploadSlot: AlertSoundSlot | null = null;

function soundStatus(slot: AlertSoundSlot, text: string, color: string): void {
    const status = el(`fa-sound-status-${slot}`);
    status.textContent = text;
    status.style.color = color;
}

function setSlotHasSound(slot: AlertSoundSlot, value: boolean): void {
    const remove = el<HTMLButtonElement>(`fa-sound-remove-${slot}`);
    remove.disabled = !value;
    remove.title = value
        ? "Remove your uploaded sound"
        : (slot === "default" ? "The built in sound cannot be removed" : "Nothing uploaded for this slot");
}

async function refreshSoundStatus(generation: number): Promise<void> {
    const owner = username();
    if (!owner || owner === "demo") return;
    for (const ep of soundSlotEndpoints(owner)) {
        try {
            const res = await fetch(`${ep.head}?v=${Date.now()}`, { method: "HEAD" });
            if (!isCurrentActivation(generation)) return;
            const own = slotHasOwnSound(ep.slot, res.ok, res.headers.get("X-Alert-Sound-Source"));
            setSlotHasSound(ep.slot, own);
            soundStatus(ep.slot, own ? "Uploaded." : (ep.slot === "default" ? "Using the built in sound." : "Using default."), "var(--muted)");
        } catch {
            if (!isCurrentActivation(generation)) return;
            soundStatus(ep.slot, "", "var(--muted)");
        }
    }
}

async function uploadSound(slot: AlertSoundSlot, file: File): Promise<void> {
    const generation = activationGeneration;
    if (file.size > 2 * 1024 * 1024) {
        soundStatus(slot, "Sound exceeds the 2 MB limit", "var(--red)");
        return;
    }
    soundStatus(slot, "Uploading...", "var(--muted)");
    const ep = soundSlotEndpoints(username()).find(e => e.slot === slot)!;
    try {
        const bytes = await file.arrayBuffer();
        await authFetch<{ ok: boolean }>(ep.upload, {
            method: "POST",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: bytes,
        });
        if (!isCurrentActivation(generation)) return;
        setSlotHasSound(slot, true);
        await refreshSoundStatus(generation);
        if (!isCurrentActivation(generation)) return;
        scheduleFollowPreview();
    } catch (e) {
        if (!isCurrentActivation(generation)) return;
        soundStatus(slot, e instanceof Error ? e.message : "Upload failed", "var(--red)");
    }
}

async function removeSound(slot: AlertSoundSlot): Promise<void> {
    const generation = activationGeneration;
    const ep = soundSlotEndpoints(username()).find(e => e.slot === slot)!;
    try {
        await authFetch<{ ok: boolean }>(ep.remove, { method: "DELETE" });
        if (!isCurrentActivation(generation)) return;
        setSlotHasSound(slot, false);
        soundStatus(slot, "Removing...", "var(--muted)");
        await refreshSoundStatus(generation);
        if (!isCurrentActivation(generation)) return;
        scheduleFollowPreview();
    } catch {
        if (!isCurrentActivation(generation)) return;
        soundStatus(slot, "Failed to remove sound", "var(--red)");
    }
}

let previewNonce = 0;
let stylePreviewTimer: number | null = null;
let previewMuted = false;
const STYLE_PREVIEW_DELAY_MS = 250;
const STYLE_FIELD_IDS = [
    "fa-style-preset", "fa-style-animation", "fa-style-accent", "fa-style-bg", "fa-style-text",
    "fa-style-bgopacity", "fa-style-fontsize", "fa-style-scale",
    "fa-style-duration", "fa-style-fadein", "fa-style-fadeout",
    "fa-style-tpl-follow", "fa-style-tpl-raid",
];

function styleForm(): AlertStyle {
    return parseAlertStyle({
        preset: el<HTMLSelectElement>("fa-style-preset").value,
        animation: el<HTMLSelectElement>("fa-style-animation").value,
        accent: el<HTMLInputElement>("fa-style-accent").value,
        bg: el<HTMLInputElement>("fa-style-bg").value,
        textColor: el<HTMLInputElement>("fa-style-text").value,
        bgOpacity: Number(el<HTMLInputElement>("fa-style-bgopacity").value),
        fontSizePx: Number(el<HTMLInputElement>("fa-style-fontsize").value),
        cardScale: Number(el<HTMLInputElement>("fa-style-scale").value),
        durationMs: Number(el<HTMLInputElement>("fa-style-duration").value),
        fadeInMs: Number(el<HTMLInputElement>("fa-style-fadein").value),
        fadeOutMs: Number(el<HTMLInputElement>("fa-style-fadeout").value),
        template: {
            follow: el<HTMLInputElement>("fa-style-tpl-follow").value,
            raid: el<HTMLInputElement>("fa-style-tpl-raid").value,
        },
    });
}

function fillStyleForm(style: AlertStyle): void {
    el<HTMLSelectElement>("fa-style-preset").value = style.preset;
    el<HTMLSelectElement>("fa-style-animation").value = style.animation;
    el<HTMLInputElement>("fa-style-accent").value = style.accent;
    el<HTMLInputElement>("fa-style-bg").value = style.bg;
    el<HTMLInputElement>("fa-style-text").value = style.textColor;
    el<HTMLInputElement>("fa-style-bgopacity").value = String(style.bgOpacity);
    el<HTMLInputElement>("fa-style-fontsize").value = String(style.fontSizePx);
    el<HTMLInputElement>("fa-style-scale").value = String(style.cardScale);
    el<HTMLInputElement>("fa-style-duration").value = String(style.durationMs);
    el<HTMLInputElement>("fa-style-fadein").value = String(style.fadeInMs);
    el<HTMLInputElement>("fa-style-fadeout").value = String(style.fadeOutMs);
    el<HTMLInputElement>("fa-style-tpl-follow").value = style.template.follow;
    el<HTMLInputElement>("fa-style-tpl-raid").value = style.template.raid;
    updateTemplateCounts();
}

function updateTemplateCounts(): void {
    el("fa-style-tpl-follow-count").textContent = String(el<HTMLInputElement>("fa-style-tpl-follow").value.length);
    el("fa-style-tpl-raid-count").textContent = String(el<HTMLInputElement>("fa-style-tpl-raid").value.length);
}

function styleStatus(text: string, color: string): void {
    const status = el("fa-style-status");
    status.textContent = text;
    status.style.color = color;
}

async function loadAlertStyle(generation: number): Promise<void> {
    let style = DEFAULT_ALERT_STYLE;
    try {
        const raw = await authFetch<unknown>("/api/profile/me/alert-style");
        style = parseAlertStyle(raw);
    } catch {}
    if (!isCurrentActivation(generation)) return;
    fillStyleForm(style);
}

async function saveAlertStyle(): Promise<void> {
    const generation = activationGeneration;
    const btn = el<HTMLButtonElement>("fa-style-save");
    btn.disabled = true;
    styleStatus("Saving...", "var(--muted)");
    try {
        const stored = await authFetch<unknown>("/api/profile/me/alert-style", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(styleForm()),
        });
        if (!isCurrentActivation(generation)) return;
        fillStyleForm(parseAlertStyle(stored));
        styleStatus("Saved.", "var(--success)");
        reloadPreview();
    } catch (e) {
        if (!isCurrentActivation(generation)) return;
        styleStatus(e instanceof Error ? e.message : "Failed to save", "var(--red)");
    }
    if (isCurrentActivation(generation)) btn.disabled = false;
}

function reloadPreview(): void {
    if (!active) return;
    const params = buildPreviewParams();
    params.set("style", JSON.stringify(styleForm()));
    previewNonce += 1;
    params.set("r", String(previewNonce));
    el<HTMLIFrameElement>("fa-preview-iframe").src = `/alerts/${username()}?${params.toString()}`;
}

function schedulePreviewStyle(): void {
    if (stylePreviewTimer !== null) window.clearTimeout(stylePreviewTimer);
    stylePreviewTimer = window.setTimeout(() => {
        stylePreviewTimer = null;
        reloadPreview();
    }, STYLE_PREVIEW_DELAY_MS);
}

function applyPreviewMuteButton(): void {
    const btn = el<HTMLButtonElement>("fa-preview-mute");
    btn.textContent = previewMuted ? "Unmute" : "Mute";
    btn.setAttribute("aria-pressed", previewMuted ? "true" : "false");
}

function previewAlert(kind: "follow" | "raid"): void {
    if (!active) return;
    el<HTMLIFrameElement>("fa-preview-iframe").contentWindow
        ?.postMessage({ type: "preview-alert", kind }, location.origin);
}

function followUrl(): string {
    if (!followToken) return "";
    return buildFollowUrl(followToken);
}

function maskedFollowUrl(): string {
    if (!followToken) return "";
    const query = buildFollowParams().toString();
    return `${location.origin}/alerts/${username()}${query ? `?${query}` : ""}#token=${maskSecret(followToken)}`;
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
    const params = buildPreviewParams();
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
    if (pendingTokenWrites.size > 0) return;
    setTokenControlsEnabled(false);
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

async function sendTestAlert(type: "follow" | "raid"): Promise<void> {
    const buttons = [el<HTMLButtonElement>("fa-test-follow-btn"), el<HTMLButtonElement>("fa-test-raid-btn")];
    const status = el("fa-test-status");
    const generation = activationGeneration;
    const revision = ++testRevision;
    for (const btn of buttons) btn.disabled = true;
    status.textContent = "";
    try {
        await authFetch<void>("/api/alerts/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
        });
        if (!isCurrentActivation(generation) || revision !== testRevision) return;
        previewAlert(type);
        status.textContent = "Test alert sent";
        status.style.color = "var(--success)";
    } catch (e) {
        if (!isCurrentActivation(generation) || revision !== testRevision) return;
        const code = (e as { status?: number }).status;
        status.textContent = code === 429 ? "Please wait a moment" : "Failed to send test alert";
        status.style.color = code === 429 ? "var(--muted)" : "var(--red)";
    }
    window.setTimeout(() => {
        if (isCurrentActivation(generation) && revision === testRevision) {
            for (const btn of buttons) btn.disabled = false;
        }
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
    el("fa-test-follow-btn").addEventListener("click", () => void sendTestAlert("follow"));
    el("fa-test-raid-btn").addEventListener("click", () => void sendTestAlert("raid"));

    for (const slot of ["default", "follow", "raid"] as const) {
        el(`fa-sound-upload-${slot}`).addEventListener("click", () => {
            pendingUploadSlot = slot;
            el<HTMLInputElement>("fa-sound-file").click();
        });
        el(`fa-sound-remove-${slot}`).addEventListener("click", () => void removeSound(slot));
    }
    el("fa-sound-file").addEventListener("change", () => {
        const input = el<HTMLInputElement>("fa-sound-file");
        const file = input.files?.[0];
        const slot = pendingUploadSlot;
        input.value = "";
        pendingUploadSlot = null;
        if (file && slot) void uploadSound(slot, file);
    });

    wireStepper(el<HTMLInputElement>("fa-style-bgopacity"));
    wireStepper(el<HTMLInputElement>("fa-style-fontsize"));
    wireStepper(el<HTMLInputElement>("fa-style-scale"));
    wireStepper(el<HTMLInputElement>("fa-style-duration"));
    wireStepper(el<HTMLInputElement>("fa-style-fadein"));
    wireStepper(el<HTMLInputElement>("fa-style-fadeout"));

    for (const id of ["fa-sound", "fa-volume"]) {
        el(id).addEventListener("input", onFollowChange);
    }
    const testMenu = el("fa-test-menu");
    const testPop = el("fa-test-pop");
    testMenu.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const open = testPop.classList.toggle("open");
        testMenu.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) el("fa-test-status").textContent = "";
    });
    document.addEventListener("pointerdown", (ev) => {
        if (!testPop.classList.contains("open")) return;
        const wrap = testMenu.parentElement;
        if (wrap && ev.target instanceof Node && !wrap.contains(ev.target)) {
            testPop.classList.remove("open");
            testMenu.setAttribute("aria-expanded", "false");
        }
    });
    el("fa-preview-mute").addEventListener("click", () => {
        previewMuted = !previewMuted;
        applyPreviewMuteButton();
        reloadPreview();
    });
    el("fa-style-reset").addEventListener("click", () => {
        if (!confirm("Reset every appearance option to its default? This replaces the style saved on your channel.")) return;
        fillStyleForm(DEFAULT_ALERT_STYLE);
        reloadPreview();
        void saveAlertStyle();
    });
    el("fa-style-save").addEventListener("click", () => void saveAlertStyle());
    el("fa-style-tpl-follow").addEventListener("input", updateTemplateCounts);
    el("fa-style-tpl-raid").addEventListener("input", updateTemplateCounts);
    const volumeValue = el("fa-volume-value");
    const volumeInput = el<HTMLInputElement>("fa-volume");
    const syncVolumeValue = (): void => { volumeValue.textContent = volumeInput.value; };
    volumeInput.addEventListener("input", syncVolumeValue);
    syncVolumeValue();
    for (const id of STYLE_FIELD_IDS) {
        const field = el(id);
        field.addEventListener("input", schedulePreviewStyle);
        field.addEventListener("change", schedulePreviewStyle);
    }
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    testRevision += 1;
    el<HTMLButtonElement>("fa-test-follow-btn").disabled = false;
    el<HTMLButtonElement>("fa-test-raid-btn").disabled = false;
    el("fa-test-status").textContent = "";
    setBackdrop("fa-preview-frame", "fa-bg-checker", "fa-bg-dark", "checker");
    applyPreviewMuteButton();
    revealed = false;
    el<HTMLButtonElement>("fa-url-reveal").textContent = "Reveal";
    updateFollowUrl();
    updateFollowPreview();
    void loadFollowToken(generation);
    void refreshSoundStatus(generation);
    void loadAlertStyle(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    if (stylePreviewTimer !== null) {
        window.clearTimeout(stylePreviewTimer);
        stylePreviewTimer = null;
    }
    testRevision += 1;
    if (followPreviewTimer !== null) {
        window.clearTimeout(followPreviewTimer);
        followPreviewTimer = null;
    }
    el<HTMLIFrameElement>("fa-preview-iframe").src = "about:blank";
    revealed = false;
}
