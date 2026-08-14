import { $ } from "../dom.ts";
import { esc } from "../format.ts";
import { closeModal, openModal } from "../modal.ts";
import {
    type ChannelPanel, computeReorderSwap, MAX_PANELS, type PanelFormInput, sortPanels, validatePanelForm,
} from "../panels.ts";
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

let panelsCache: ChannelPanel[] = [];

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
    if (pendingProfileWrites.size > 0) return;
    current = null;
    setProfileControlsEnabled(false);
    $("pf-saved").textContent = "Loading...";
    $("pf-saved").style.color = "var(--muted)";
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

function panelThumbHtml(panel: ChannelPanel): string {
    if (panel.imageUrl) {
        return `<img src="${esc(panel.imageUrl)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;background:rgba(255,255,255,.05);flex-shrink:0" />`;
    }
    return `<div style="width:56px;height:56px;border-radius:6px;background:rgba(255,255,255,.05);flex-shrink:0"></div>`;
}

function panelBodyPreview(body: string): string {
    const trimmed = body.trim();
    return trimmed.length <= 90 ? trimmed : `${trimmed.slice(0, 90)}...`;
}

function panelRowHtml(panel: ChannelPanel, index: number, total: number): string {
    const hint = current ? formatHint(current) : "";
    return `
        <div class="card" style="padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start">
            ${panelThumbHtml(panel)}
            <div style="flex:1;min-width:0">
                <div style="font-weight:600">${panel.title ? esc(panel.title) : `<span style="color:var(--muted)">Untitled</span>`}</div>
                ${panel.body ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(panelBodyPreview(panel.body))}</div>` : ""}
                ${panel.linkUrl ? `<div style="font-size:12px;margin-top:4px"><a href="${esc(panel.linkUrl)}" target="_blank" rel="noopener noreferrer">${esc(panel.linkUrl)}</a></div>` : ""}
                <input type="file" id="pf-panel-file-${panel.id}" accept="image/png,image/jpeg,image/gif" hidden />
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                    <button type="button" class="btn btn-sm" data-panel-up="${panel.id}"${index === 0 ? " disabled" : ""}>Up</button>
                    <button type="button" class="btn btn-sm" data-panel-down="${panel.id}"${index === total - 1 ? " disabled" : ""}>Down</button>
                    <button type="button" class="btn btn-sm" data-panel-edit="${panel.id}">Edit</button>
                    <button type="button" class="btn btn-sm" data-panel-image="${panel.id}">${panel.imageUrl ? "Replace image" : "Add image"}</button>
                    ${panel.imageUrl ? `<button type="button" class="btn btn-sm" data-panel-image-remove="${panel.id}">Remove image</button>` : ""}
                    <button type="button" class="btn btn-sm btn-danger" data-panel-delete="${panel.id}">Delete</button>
                </div>
                ${hint ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">${esc(hint)}</div>` : ""}
                <div id="pf-panel-error-${panel.id}" style="font-size:12px;color:var(--red);margin-top:6px"></div>
            </div>
        </div>`;
}

function setPanelsBusy(busy: boolean): void {
    ($("pf-panel-add") as HTMLButtonElement).disabled = busy || current === null || panelsCache.length >= MAX_PANELS;
    $("pf-panels-list").querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = busy; });
}

function wirePanelRowActions(): void {
    const list = $("pf-panels-list");
    list.querySelectorAll<HTMLButtonElement>("[data-panel-up]").forEach(btn => {
        btn.addEventListener("click", () => void movePanel(Number(btn.dataset["panelUp"]), "up"));
    });
    list.querySelectorAll<HTMLButtonElement>("[data-panel-down]").forEach(btn => {
        btn.addEventListener("click", () => void movePanel(Number(btn.dataset["panelDown"]), "down"));
    });
    list.querySelectorAll<HTMLButtonElement>("[data-panel-edit]").forEach(btn => {
        btn.addEventListener("click", () => {
            const panel = panelsCache.find(p => p.id === Number(btn.dataset["panelEdit"]));
            if (panel) openPanelModal(panel);
        });
    });
    list.querySelectorAll<HTMLButtonElement>("[data-panel-delete]").forEach(btn => {
        btn.addEventListener("click", () => void deletePanel(Number(btn.dataset["panelDelete"])));
    });
    list.querySelectorAll<HTMLButtonElement>("[data-panel-image]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = Number(btn.dataset["panelImage"]);
            (document.getElementById(`pf-panel-file-${id}`) as HTMLInputElement | null)?.click();
        });
    });
    list.querySelectorAll<HTMLButtonElement>("[data-panel-image-remove]").forEach(btn => {
        btn.addEventListener("click", () => void removePanelImage(Number(btn.dataset["panelImageRemove"])));
    });
    list.querySelectorAll<HTMLInputElement>("input[type=file]").forEach(input => {
        input.addEventListener("change", () => {
            const file = input.files?.[0] ?? null;
            input.value = "";
            const id = Number(input.id.replace("pf-panel-file-", ""));
            if (file) void uploadPanelImage(id, file);
        });
    });
}

function renderPanels(): void {
    if (!active) return;
    const list = $("pf-panels-list");
    const sorted = sortPanels(panelsCache);
    list.innerHTML = sorted.length
        ? sorted.map((p, i) => panelRowHtml(p, i, sorted.length)).join("")
        : `<div style="color:var(--muted);font-size:13px">No cards yet.</div>`;
    $("pf-panels-count").textContent = `${sorted.length} / ${MAX_PANELS} cards`;
    ($("pf-panel-add") as HTMLButtonElement).disabled = current === null || sorted.length >= MAX_PANELS;
    wirePanelRowActions();
}

async function loadPanels(): Promise<void> {
    const errEl = $("pf-panels-error");
    errEl.textContent = "";
    try {
        const panels = await authFetch<ChannelPanel[]>("/api/profile/me/panels");
        if (!active) return;
        panelsCache = panels;
        renderPanels();
    } catch (e) {
        if (!active) return;
        errEl.textContent = e instanceof Error ? e.message : String(e);
    }
}

async function movePanel(id: number, direction: "up" | "down"): Promise<void> {
    const swap = computeReorderSwap(panelsCache, id, direction);
    if (!swap) return;
    const [a, b] = swap;
    const errEl = $("pf-panels-error");
    errEl.textContent = "";
    setPanelsBusy(true);
    try {
        const [updatedA, updatedB] = await Promise.all([
            authFetch<ChannelPanel>(`/api/profile/me/panels/${a.id}`, { method: "PATCH", body: JSON.stringify({ position: a.position }) }),
            authFetch<ChannelPanel>(`/api/profile/me/panels/${b.id}`, { method: "PATCH", body: JSON.stringify({ position: b.position }) }),
        ]);
        panelsCache = panelsCache.map(p => {
            if (p.id === updatedA.id) return updatedA;
            if (p.id === updatedB.id) return updatedB;
            return p;
        });
    } catch (e) {
        errEl.textContent = e instanceof Error ? e.message : String(e);
    } finally {
        renderPanels();
    }
}

async function deletePanel(id: number): Promise<void> {
    const panel = panelsCache.find(p => p.id === id);
    if (!panel) return;
    if (!confirm(`Delete ${panel.title ? `"${panel.title}"` : "this card"}? This cannot be undone.`)) return;
    const errEl = $("pf-panels-error");
    errEl.textContent = "";
    setPanelsBusy(true);
    try {
        await authFetch(`/api/profile/me/panels/${id}`, { method: "DELETE" });
        panelsCache = panelsCache.filter(p => p.id !== id);
    } catch (e) {
        errEl.textContent = e instanceof Error ? e.message : String(e);
    } finally {
        renderPanels();
    }
}

async function uploadPanelImage(id: number, file: File): Promise<void> {
    const errEl = document.getElementById(`pf-panel-error-${id}`);
    if (errEl) errEl.textContent = "";
    if (!current) return;
    const clientError = checkClientSide(file, current);
    if (clientError) {
        if (errEl) errEl.textContent = clientError;
        return;
    }
    setPanelsBusy(true);
    try {
        const bytes = await file.arrayBuffer();
        const updated = await authFetch<ChannelPanel>(`/api/profile/me/panels/${id}/image`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: bytes,
        });
        panelsCache = panelsCache.map(p => (p.id === id ? updated : p));
    } catch (e) {
        if (errEl) errEl.textContent = e instanceof Error ? e.message : String(e);
    } finally {
        renderPanels();
    }
}

async function removePanelImage(id: number): Promise<void> {
    const errEl = document.getElementById(`pf-panel-error-${id}`);
    if (errEl) errEl.textContent = "";
    setPanelsBusy(true);
    try {
        const updated = await authFetch<ChannelPanel>(`/api/profile/me/panels/${id}/image`, { method: "DELETE" });
        panelsCache = panelsCache.map(p => (p.id === id ? updated : p));
    } catch (e) {
        if (errEl) errEl.textContent = e instanceof Error ? e.message : String(e);
    } finally {
        renderPanels();
    }
}

function panelFormHtml(panel?: ChannelPanel): string {
    return `
        <div class="form-grid">
            <label class="span2"><span>Title</span><input id="panel-form-title" type="text" maxlength="80" value="${esc(panel?.title ?? "")}"></label>
            <label class="span2"><span>Body</span><textarea id="panel-form-body" maxlength="300" rows="4">${esc(panel?.body ?? "")}</textarea></label>
            <label class="span2"><span>Link URL</span><input id="panel-form-link" type="text" maxlength="512" placeholder="https://example.com" value="${esc(panel?.linkUrl ?? "")}"></label>
        </div>
        <div id="panel-form-error" style="color:var(--red);font-size:13px;margin-top:8px"></div>`;
}

async function submitPanelForm(existing?: ChannelPanel): Promise<void> {
    const errEl = document.getElementById("panel-form-error");
    const input: PanelFormInput = {
        title: (document.getElementById("panel-form-title") as HTMLInputElement).value,
        body: (document.getElementById("panel-form-body") as HTMLTextAreaElement).value,
        linkUrl: (document.getElementById("panel-form-link") as HTMLInputElement).value,
    };
    const errors = validatePanelForm(input);
    const firstError = errors.title ?? errors.body ?? errors.linkUrl ?? null;
    if (firstError) {
        if (errEl) errEl.textContent = firstError;
        return;
    }
    const saveBtn = document.getElementById("panel-form-save") as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = true;
    const body = { title: input.title.trim(), body: input.body.trim(), linkUrl: input.linkUrl.trim() };
    try {
        if (existing) {
            const updated = await authFetch<ChannelPanel>(`/api/profile/me/panels/${existing.id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
            panelsCache = panelsCache.map(p => (p.id === updated.id ? updated : p));
        } else {
            const created = await authFetch<ChannelPanel>("/api/profile/me/panels", {
                method: "POST",
                body: JSON.stringify(body),
            });
            panelsCache = [...panelsCache, created];
        }
        renderPanels();
        closeModal();
    } catch (e) {
        const err = e as Error & { status?: number };
        if (errEl) errEl.textContent = err.status === 409 ? "You've reached the 12 card limit." : (err.message || String(e));
        if (saveBtn) saveBtn.disabled = false;
    }
}

function openPanelModal(panel?: ChannelPanel): void {
    openModal(panel ? "Edit card" : "New card", panelFormHtml(panel),
        `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="panel-form-save">${panel ? "Save" : "Create"}</button>`);
    document.getElementById("panel-form-save")?.addEventListener("click", () => void submitPanelForm(panel));
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
    $("pf-panel-add").addEventListener("click", () => {
        if (panelsCache.length >= MAX_PANELS) return;
        openPanelModal();
    });
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void loadMyProfile(generation);
    void loadPanels();
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    current = null;
    panelsCache = [];
}
