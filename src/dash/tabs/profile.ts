import { $ } from "../dom.ts";
import { authFetch } from "../session.ts";

interface ProfileLink {
    label: string;
    url: string;
}

interface MyProfile {
    username: string;
    bio: string;
    links: ProfileLink[];
    hasAvatar: boolean;
    hasBanner: boolean;
    avatarVersion: number;
    bannerVersion: number;
    maxImageBytes: number;
    allowedFormats: string[];
}

const MAX_BIO = 500;
const MAX_LINKS = 5;

let current: MyProfile | null = null;
let activationGeneration = 0;
let profileRevision = 0;
let active = false;
const pendingProfileWrites = new Set<number>();

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function isCurrentProfileOperation(generation: number, revision: number): boolean {
    return isCurrentActivation(generation) && revision === profileRevision;
}

function refreshProfileIfActive(): void {
    if (active) void loadMyProfile(activationGeneration);
}

const PROFILE_CONTROL_IDS = [
    "pf-save",
    "pf-link-add",
    "pf-avatar-upload",
    "pf-avatar-remove",
    "pf-banner-upload",
    "pf-banner-remove",
];

function setProfileControlsEnabled(enabled: boolean): void {
    for (const id of PROFILE_CONTROL_IDS) {
        ($(id) as HTMLButtonElement).disabled = !enabled;
    }
    ($("pf-bio") as HTMLTextAreaElement).disabled = !enabled;
    $("pf-links").querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")
        .forEach(control => { control.disabled = !enabled; });
    $("pane-channel-profile").setAttribute("aria-busy", String(!enabled));
}

function formatBytes(n: number): string {
    if (n >= 1024 * 1024) {
        const mib = n / (1024 * 1024);
        return `${mib % 1 === 0 ? mib.toFixed(0) : mib.toFixed(1)} MiB`;
    }
    return `${Math.round(n / 1024)} KiB`;
}

function extFromMime(mime: string): string {
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/gif") return "gif";
    return "";
}

function updateBioCount(): void {
    const textarea = $("pf-bio") as HTMLTextAreaElement;
    $("pf-bio-count").textContent = `${textarea.value.length} / ${MAX_BIO}`;
}

function updateAddButtonState(): void {
    const addBtn = $("pf-link-add") as HTMLButtonElement;
    addBtn.disabled = $("pf-links").children.length >= MAX_LINKS;
}

function buildLinkRow(link: ProfileLink): HTMLElement {
    const row = document.createElement("div");
    row.className = "pf-link-row";
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";

    const label = document.createElement("input");
    label.type = "text";
    label.maxLength = 40;
    label.placeholder = "Label";
    label.setAttribute("aria-label", "Link label");
    label.disabled = current === null;
    label.value = link.label;
    label.style.cssText = "flex:0 0 140px";

    const url = document.createElement("input");
    url.type = "text";
    url.maxLength = 512;
    url.placeholder = "https://x.com/yourname";
    url.setAttribute("aria-label", "Link URL");
    url.disabled = current === null;
    url.value = link.url;
    url.style.cssText = "flex:1";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-sm";
    remove.textContent = "Remove";
    remove.disabled = current === null;
    remove.addEventListener("click", () => {
        row.remove();
        updateAddButtonState();
    });

    row.append(label, url, remove);
    return row;
}

function renderLinks(links: ProfileLink[]): void {
    const container = $("pf-links");
    container.replaceChildren();
    for (const link of links) container.appendChild(buildLinkRow(link));
    updateAddButtonState();
}

function readLinkRows(): ProfileLink[] {
    const rows = Array.from($("pf-links").children) as HTMLElement[];
    const out: ProfileLink[] = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll<HTMLInputElement>("input");
        const label = inputs[0]?.value.trim() ?? "";
        const url = inputs[1]?.value.trim() ?? "";
        if (label || url) out.push({ label, url });
    }
    return out;
}

function renderPreview(container: HTMLElement, has: boolean, url: string): void {
    container.replaceChildren();
    if (has) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        container.appendChild(img);
        return;
    }
    const span = document.createElement("span");
    span.style.cssText = "color:var(--muted);font-size:12px";
    span.textContent = "No image";
    container.appendChild(span);
}

function formatHint(profile: MyProfile): string {
    return `${profile.allowedFormats.map(f => f.toUpperCase()).join(", ")}, up to ${formatBytes(profile.maxImageBytes)}`;
}

function applyProfile(profile: MyProfile): void {
    if (!active) return;
    current = profile;
    ($("pf-bio") as HTMLTextAreaElement).value = profile.bio;
    updateBioCount();
    renderLinks(profile.links);
    const hint = formatHint(profile);
    $("pf-avatar-hint").textContent = hint;
    $("pf-banner-hint").textContent = `${hint}. 16:9 recommended`;
    renderPreview($("pf-avatar-preview"), profile.hasAvatar, `/api/live/profile/${encodeURIComponent(profile.username)}/avatar?v=${profile.avatarVersion}`);
    renderPreview($("pf-banner-preview"), profile.hasBanner, `/api/live/profile/${encodeURIComponent(profile.username)}/banner?v=${profile.bannerVersion}`);
    $("pf-saved").textContent = "";
    setProfileControlsEnabled(true);
    updateAddButtonState();
}

function checkClientSide(file: File, profile: MyProfile): string | null {
    if (file.size > profile.maxImageBytes) return `File is too large. Limit is ${formatBytes(profile.maxImageBytes)}.`;
    const ext = extFromMime(file.type);
    if (!ext || !profile.allowedFormats.includes(ext)) {
        return `Unsupported format. Allowed: ${profile.allowedFormats.map(f => f.toUpperCase()).join(", ")}.`;
    }
    return null;
}

async function uploadImage(kind: "avatar" | "banner", file: File): Promise<void> {
    const errEl = $(`pf-${kind}-error`);
    errEl.textContent = "";
    if (!current) return;
    const clientError = checkClientSide(file, current);
    if (clientError) {
        errEl.textContent = clientError;
        return;
    }
    const generation = activationGeneration;
    const revision = ++profileRevision;
    pendingProfileWrites.add(revision);
    setProfileControlsEnabled(false);
    let refresh = false;
    try {
        const bytes = await file.arrayBuffer();
        const updated = await authFetch<MyProfile>(`/api/profile/me/${kind}`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: bytes,
        });
        if (isCurrentProfileOperation(generation, revision)) applyProfile(updated);
        else refresh = true;
    } catch (e) {
        if (isCurrentProfileOperation(generation, revision)) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            setProfileControlsEnabled(true);
        } else {
            refresh = true;
        }
    } finally {
        pendingProfileWrites.delete(revision);
        if (refresh) refreshProfileIfActive();
    }
}

async function removeImage(kind: "avatar" | "banner"): Promise<void> {
    if (!current) return;
    const errEl = $(`pf-${kind}-error`);
    errEl.textContent = "";
    const generation = activationGeneration;
    const revision = ++profileRevision;
    pendingProfileWrites.add(revision);
    setProfileControlsEnabled(false);
    let refresh = false;
    try {
        const updated = await authFetch<MyProfile>(`/api/profile/me/${kind}`, { method: "DELETE" });
        if (isCurrentProfileOperation(generation, revision)) applyProfile(updated);
        else refresh = true;
    } catch (e) {
        if (isCurrentProfileOperation(generation, revision)) {
            errEl.textContent = e instanceof Error ? e.message : String(e);
            setProfileControlsEnabled(true);
        } else {
            refresh = true;
        }
    } finally {
        pendingProfileWrites.delete(revision);
        if (refresh) refreshProfileIfActive();
    }
}

function wireImageControls(kind: "avatar" | "banner"): void {
    const fileInput = $(`pf-${kind}-file`) as HTMLInputElement;
    $(`pf-${kind}-upload`).addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0] ?? null;
        fileInput.value = "";
        if (file) void uploadImage(kind, file);
    });
    $(`pf-${kind}-remove`).addEventListener("click", () => void removeImage(kind));
}

async function loadMyProfile(generation: number): Promise<void> {
    current = null;
    setProfileControlsEnabled(false);
    $("pf-saved").textContent = "Loading...";
    $("pf-saved").style.color = "var(--muted)";
    if (pendingProfileWrites.size > 0) return;
    const revision = ++profileRevision;
    try {
        const profile = await authFetch<MyProfile>("/api/profile/me");
        if (!isCurrentProfileOperation(generation, revision)) return;
        applyProfile(profile);
    } catch (e) {
        if (!isCurrentProfileOperation(generation, revision)) return;
        const saved = $("pf-saved");
        $("pane-channel-profile").setAttribute("aria-busy", "false");
        saved.textContent = e instanceof Error ? e.message : String(e);
        saved.style.color = "var(--red)";
    }
}

export function init(): void {
    $("pf-bio").addEventListener("input", updateBioCount);
    $("pf-link-add").addEventListener("click", () => {
        if ($("pf-links").children.length >= MAX_LINKS) return;
        $("pf-links").appendChild(buildLinkRow({ label: "", url: "" }));
        updateAddButtonState();
    });
    $("pf-save").addEventListener("click", async () => {
        if (!current) return;
        const saved = $("pf-saved");
        saved.textContent = "";
        const bio = ($("pf-bio") as HTMLTextAreaElement).value;
        const links = readLinkRows();
        const generation = activationGeneration;
        const revision = ++profileRevision;
        pendingProfileWrites.add(revision);
        setProfileControlsEnabled(false);
        let refresh = false;
        try {
            const updated = await authFetch<MyProfile>("/api/profile/me", {
                method: "PUT",
                body: JSON.stringify({ bio, links }),
            });
            if (!isCurrentProfileOperation(generation, revision)) {
                refresh = true;
                return;
            }
            applyProfile(updated);
            saved.textContent = "Saved";
            saved.style.color = "var(--success)";
            window.setTimeout(() => {
                if (isCurrentProfileOperation(generation, revision) && saved.textContent === "Saved") {
                    saved.textContent = "";
                }
            }, 2500);
        } catch (e) {
            if (isCurrentProfileOperation(generation, revision)) {
                saved.textContent = e instanceof Error ? e.message : String(e);
                saved.style.color = "var(--red)";
                setProfileControlsEnabled(true);
            } else {
                refresh = true;
            }
        } finally {
            pendingProfileWrites.delete(revision);
            if (refresh) refreshProfileIfActive();
        }
    });
    wireImageControls("avatar");
    wireImageControls("banner");
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void loadMyProfile(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    current = null;
}
