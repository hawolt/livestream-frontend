import { $ } from "../dom.ts";
import { authFetch } from "../session.ts";

type Pool = "static" | "gif";
type Rendition = "1x" | "2x" | "4x";

const RENDITIONS: Rendition[] = ["1x", "2x", "4x"];

interface EmoteEntry {
    id: number;
    name: string;
    pool: Pool;
    slotIndex: number;
    enabled: boolean;
    disabledReason: string | null;
    locked: boolean;
    incomplete: boolean;
    renditions: Record<Rendition, boolean>;
    previewUrl: string | null;
}

interface PoolState {
    entitledSlots: number;
    emotes: EmoteEntry[];
}

interface EmotesPayload {
    pools: Record<Pool, PoolState>;
}

const NAME_PATTERN = /^[A-Za-z0-9_]{2,24}$/;
const MAX_RENDITION_BYTES = 512 * 1024;

let active = false;
let activationGeneration = 0;
let current: EmotesPayload | null = null;

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function setError(id: string, message: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function buildRenditionCell(emote: EmoteEntry, rendition: Rendition): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "em-rendition";

    const label = document.createElement("div");
    label.className = "em-rendition-label";
    label.textContent = rendition;
    cell.appendChild(label);

    if (emote.renditions[rendition] && emote.previewUrl) {
        const img = document.createElement("img");
        img.className = "em-rendition-preview";
        img.src = `/api/live/emote/${emote.id}/${rendition}?v=${Date.now()}`;
        img.alt = `${emote.name} ${rendition}`;
        cell.appendChild(img);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-sm";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => void deleteRendition(emote, rendition));
        cell.appendChild(remove);
    } else {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.id = `em-file-${emote.id}-${rendition}`;
        fileInput.accept = emote.pool === "gif" ? "image/gif" : "image/png,image/jpeg";
        fileInput.style.display = "none";
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0] ?? null;
            fileInput.value = "";
            if (file) void uploadRendition(emote, rendition, file);
        });
        const upload = document.createElement("button");
        upload.type = "button";
        upload.className = "btn btn-sm";
        upload.textContent = "Upload";
        upload.addEventListener("click", () => fileInput.click());
        cell.append(fileInput, upload);
    }

    return cell;
}

function buildEmoteRow(emote: EmoteEntry, index: number, poolSize: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "em-row"
        + (emote.locked ? " em-locked" : "")
        + (!emote.enabled ? " em-disabled" : "")
        + (emote.incomplete ? " em-incomplete" : "");

    const head = document.createElement("div");
    head.className = "em-row-head";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "em-name-input";
    nameInput.maxLength = 24;
    nameInput.value = emote.name;
    nameInput.setAttribute("aria-label", "Emote name");
    head.appendChild(nameInput);

    const saveName = document.createElement("button");
    saveName.type = "button";
    saveName.className = "btn btn-sm";
    saveName.textContent = "Rename";
    saveName.addEventListener("click", () => void renameEmote(emote, nameInput.value.trim()));
    head.appendChild(saveName);

    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.className = "btn btn-sm";
    moveUp.textContent = "↑";
    moveUp.setAttribute("aria-label", "Move up");
    moveUp.disabled = index === 0;
    moveUp.addEventListener("click", () => void moveEmote(emote.pool, index, index - 1));
    head.appendChild(moveUp);

    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.className = "btn btn-sm";
    moveDown.textContent = "↓";
    moveDown.setAttribute("aria-label", "Move down");
    moveDown.disabled = index === poolSize - 1;
    moveDown.addEventListener("click", () => void moveEmote(emote.pool, index, index + 1));
    head.appendChild(moveDown);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => void deleteEmote(emote));
    head.appendChild(del);

    row.appendChild(head);

    if (emote.locked) {
        const hint = document.createElement("div");
        hint.className = "em-hint em-hint-locked";
        hint.textContent = "Locked: you no longer have enough Personal Emotes slots for this one. Buy more or reorder to unlock it.";
        row.appendChild(hint);
    }
    if (!emote.enabled) {
        const hint = document.createElement("div");
        hint.className = "em-hint em-hint-disabled";
        hint.textContent = emote.disabledReason
            ? `Taken down by staff: ${emote.disabledReason}`
            : "Taken down by staff.";
        row.appendChild(hint);
    }
    if (emote.incomplete) {
        const hint = document.createElement("div");
        hint.className = "em-hint em-hint-incomplete";
        const text = document.createElement("span");
        text.textContent = "Incomplete: no usable image yet, so this emote will not appear in chat.";
        hint.appendChild(text);
        const finish = document.createElement("button");
        finish.type = "button";
        finish.className = "btn btn-sm";
        finish.textContent = "Finish uploading";
        finish.addEventListener("click", () => {
            document.getElementById(`em-file-${emote.id}-2x`)?.click();
        });
        hint.appendChild(finish);
        row.appendChild(hint);
    }

    const rowError = document.createElement("div");
    rowError.className = "field-error";
    rowError.id = `em-row-error-${emote.id}`;
    row.appendChild(rowError);

    const renditions = document.createElement("div");
    renditions.className = "em-renditions";
    for (const rendition of RENDITIONS) renditions.appendChild(buildRenditionCell(emote, rendition));
    row.appendChild(renditions);

    return row;
}

function renderPool(pool: Pool, state: PoolState): void {
    const section = $(`em-pool-${pool}`);
    section.querySelector(".em-pool-count")!.textContent = `${state.emotes.length} / ${state.entitledSlots} slots used`;
    const list = section.querySelector(".em-pool-list") as HTMLElement;
    list.replaceChildren();
    if (!state.emotes.length) {
        const empty = document.createElement("div");
        empty.className = "em-empty";
        empty.textContent = state.entitledSlots > 0
            ? "No emotes yet. Add one below."
            : `You need the ${pool === "gif" ? "Animated Personal Emotes" : "Personal Emotes"} add-on to create emotes here.`;
        list.appendChild(empty);
    } else {
        state.emotes.forEach((emote, index) => list.appendChild(buildEmoteRow(emote, index, state.emotes.length)));
    }
    const addBtn = section.querySelector(".em-add-btn") as HTMLButtonElement;
    addBtn.disabled = state.entitledSlots <= 0 || state.emotes.length >= state.entitledSlots;
}

function render(payload: EmotesPayload): void {
    renderPool("static", payload.pools.static);
    renderPool("gif", payload.pools.gif);
}

async function reload(generation: number): Promise<void> {
    try {
        const payload = await authFetch<EmotesPayload>("/api/profile/me/emotes");
        if (!isCurrentActivation(generation)) return;
        current = payload;
        render(payload);
    } catch (e) {
        if (!isCurrentActivation(generation)) return;
        setError("em-error", e instanceof Error ? e.message : String(e));
    }
}

function refreshIfActive(): void {
    if (active) void reload(activationGeneration);
}

async function createEmote(pool: Pool, name: string, file: File | null): Promise<void> {
    setError(`em-add-error-${pool}`, "");
    if (!NAME_PATTERN.test(name)) {
        setError(`em-add-error-${pool}`, "Name must be 2-24 letters, digits or underscores.");
        return;
    }
    if (!file) {
        setError(`em-add-error-${pool}`, "Choose an image to upload with the new emote.");
        return;
    }
    if (file.size > MAX_RENDITION_BYTES) {
        setError(`em-add-error-${pool}`, "File is too large.");
        return;
    }
    let created: EmoteEntry;
    try {
        created = await authFetch<EmoteEntry>(`/api/profile/me/emotes`, {
            method: "POST",
            body: JSON.stringify({ name, pool }),
        });
    } catch (e) {
        setError(`em-add-error-${pool}`, e instanceof Error ? e.message : String(e));
        return;
    }
    try {
        const bytes = await file.arrayBuffer();
        await authFetch(`/api/profile/me/emotes/${created.id}/rendition/2x`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: bytes,
        });
    } catch (e) {
        setError(`em-add-error-${pool}`,
            `Created ${name}, but the image failed to upload: ${e instanceof Error ? e.message : String(e)}. Finish uploading below.`);
    }
    refreshIfActive();
}

async function renameEmote(emote: EmoteEntry, name: string): Promise<void> {
    setError(`em-row-error-${emote.id}`, "");
    if (!NAME_PATTERN.test(name)) {
        setError(`em-row-error-${emote.id}`, "Name must be 2-24 letters, digits or underscores.");
        return;
    }
    try {
        await authFetch(`/api/profile/me/emotes/${emote.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
        });
        refreshIfActive();
    } catch (e) {
        setError(`em-row-error-${emote.id}`, e instanceof Error ? e.message : String(e));
    }
}

async function deleteEmote(emote: EmoteEntry): Promise<void> {
    if (!confirm(`Delete ${emote.name}? This cannot be undone.`)) return;
    try {
        await authFetch(`/api/profile/me/emotes/${emote.id}`, { method: "DELETE" });
        refreshIfActive();
    } catch (e) {
        setError("em-error", e instanceof Error ? e.message : String(e));
    }
}

async function moveEmote(pool: Pool, from: number, to: number): Promise<void> {
    if (!current) return;
    const state = current.pools[pool];
    if (to < 0 || to >= state.emotes.length) return;
    const order = state.emotes.map(e => e.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved!);
    try {
        await authFetch(`/api/profile/me/emotes/reorder`, {
            method: "PUT",
            body: JSON.stringify({ pool, order }),
        });
        refreshIfActive();
    } catch (e) {
        setError("em-error", e instanceof Error ? e.message : String(e));
    }
}

async function uploadRendition(emote: EmoteEntry, rendition: Rendition, file: File): Promise<void> {
    setError(`em-row-error-${emote.id}`, "");
    if (file.size > MAX_RENDITION_BYTES) {
        setError(`em-row-error-${emote.id}`, "File is too large.");
        return;
    }
    try {
        const bytes = await file.arrayBuffer();
        await authFetch(`/api/profile/me/emotes/${emote.id}/rendition/${rendition}`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: bytes,
        });
        refreshIfActive();
    } catch (e) {
        setError(`em-row-error-${emote.id}`, e instanceof Error ? e.message : String(e));
    }
}

async function deleteRendition(emote: EmoteEntry, rendition: Rendition): Promise<void> {
    try {
        await authFetch(`/api/profile/me/emotes/${emote.id}/rendition/${rendition}`, { method: "DELETE" });
        refreshIfActive();
    } catch (e) {
        setError(`em-row-error-${emote.id}`, e instanceof Error ? e.message : String(e));
    }
}

function wirePool(pool: Pool): void {
    const section = $(`em-pool-${pool}`);
    const nameInput = section.querySelector(".em-add-name") as HTMLInputElement;
    const fileInput = section.querySelector(".em-add-file") as HTMLInputElement;
    const fileBtn = section.querySelector(".em-add-file-btn") as HTMLButtonElement;
    const fileLabel = section.querySelector(".em-add-file-label") as HTMLElement;
    const addBtn = section.querySelector(".em-add-btn") as HTMLButtonElement;
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        fileLabel.textContent = fileInput.files?.[0]?.name ?? "No file chosen";
    });
    addBtn.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const file = fileInput.files?.[0] ?? null;
        nameInput.value = "";
        fileInput.value = "";
        fileLabel.textContent = "No file chosen";
        void createEmote(pool, name, file);
    });
}

export function init(): void {
    wirePool("static");
    wirePool("gif");
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void reload(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    current = null;
}
