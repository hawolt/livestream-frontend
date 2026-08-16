import { buildAvatar, buildProfileLinks, followerLabel, loadProfile, type Profile, type ProfilePanel } from "../profile-card.ts";
import { isSafeHttpLink } from "./about/panels.ts";
import { cardImageError, validateCardForm, type CardType } from "./about/card-form.ts";
import { subscriberBadgeAssetPath, subscriberBadgeTitle } from "../chat/badges.ts";
import { loadChannelClips, type AboutClip, type ClipsSort } from "./about/clips.ts";
import { relativeDate } from "./about/relative-date.ts";
import { formatCompactCount } from "./format.ts";
import { viewerOwnsChannel } from "./points.ts";
import { API_BASE } from "../api.ts";
import { ctx } from "./player/context.ts";
import { openDismissibleSurface, closeDismissibleSurface } from "../dismissible-surface.ts";
import {
    aboutBioEl,
    aboutBoxEl,
    aboutClipsEl,
    aboutClipsRowEl,
    aboutClipsSortNewestEl,
    aboutClipsSortViewsEl,
    aboutFollowersEl,
    aboutHeadingEl,
    aboutLinksEl,
    aboutPanelsActionsEl,
    aboutPanelsEl,
    aboutPanelsSectionEl,
    aboutAddCardBtnEl,
    cardModalCloseEl,
    cardModalBodyInputEl,
    cardModalErrorEl,
    cardModalEl,
    cardModalFileBtnEl,
    cardModalFileInputEl,
    cardModalFileNameEl,
    cardModalFormEl,
    cardModalImageGroupEl,
    cardModalLinkInputEl,
    cardModalSubmitEl,
    cardModalTitleInputEl,
    cardModalTypeImageEl,
    cardModalTypeTextEl,
    channelAvatarWrapEl,
} from "./dom.ts";

let currentPanels: ProfilePanel[] = [];
let ownerChannel = "";
let isOwner = false;

export function applyChannelIdentity(profile: Profile | null): void {
    channelAvatarWrapEl.replaceChildren();
    if (profile) channelAvatarWrapEl.appendChild(buildAvatar(profile));
}

function buildPanelCard(panel: ProfilePanel, owner: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = "live-about-panel";
    if (panel.title) {
        const title = document.createElement("div");
        title.className = "live-about-panel-title";
        title.textContent = panel.title;
        card.appendChild(title);
    }
    if (panel.imageUrl) {
        const img = document.createElement("img");
        img.className = "live-about-panel-img";
        img.src = panel.imageUrl;
        img.alt = "";
        img.loading = "lazy";
        if (panel.linkUrl && isSafeHttpLink(panel.linkUrl)) {
            const a = document.createElement("a");
            a.href = panel.linkUrl;
            a.target = "_blank";
            a.rel = "noopener";
            a.appendChild(img);
            card.appendChild(a);
        } else {
            card.appendChild(img);
        }
    }
    if (panel.body) {
        const body = document.createElement("div");
        body.className = "live-about-panel-body";
        body.textContent = panel.body;
        card.appendChild(body);
    }
    if (owner) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "live-about-panel-delete";
        del.setAttribute("aria-label", "Delete card");
        del.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
        del.addEventListener("click", () => void deleteCard(panel.id));
        card.appendChild(del);
    }
    return card;
}


let activityDays = new Set<string>();
let activityLoadedFor = "";

const ACTIVITY_EPOCH = "2026-08-16";
const DAY_MS = 86400000;

const EXPAND_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

function dayKeyFromTime(t: number): string {
    return new Date(t).toISOString().slice(0, 10);
}

function todayKey(): string {
    return dayKeyFromTime(Date.now());
}

function dayTime(key: string): number {
    return new Date(`${key}T00:00:00Z`).getTime();
}

function buildActivityCell(key: string): HTMLElement {
    const today = todayKey();
    const cell = document.createElement("div");
    let cls = "live-activity-cell";
    if (activityDays.has(key)) cls += " on";
    else if (key > today) cls += " future";
    if (key === today) cls += " today";
    cell.className = cls;
    cell.title = activityDays.has(key) ? `${key} - live` : key;
    return cell;
}

function buildActivityCells(count: number): HTMLElement {
    const strip = document.createElement("div");
    strip.className = "live-activity-strip";
    const epoch = dayTime(ACTIVITY_EPOCH);
    const windowStart = Math.max(epoch, dayTime(todayKey()) - (count - 1) * DAY_MS);
    for (let i = 0; i < count; i++) {
        strip.appendChild(buildActivityCell(dayKeyFromTime(windowStart + i * DAY_MS)));
    }
    return strip;
}

function openActivityHistory(): void {
    document.getElementById("live-activity-history")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "live-activity-history";
    overlay.className = "login-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const box = document.createElement("div");
    box.className = "login-modal-box live-activity-history-box";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "login-modal-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    close.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) overlay.remove();
    });
    const heading = document.createElement("h3");
    heading.textContent = "Stream activity";
    box.append(close, heading);
    const epoch = dayTime(ACTIVITY_EPOCH);
    const start = epoch - new Date(epoch).getUTCDay() * DAY_MS;
    const minEnd = dayTime(todayKey()) + 7 * DAY_MS;
    const end = Math.max(start + 20 * 7 * DAY_MS, minEnd);
    const grid = document.createElement("div");
    grid.className = "live-activity-grid";
    for (let t = start; t < end; t += DAY_MS) {
        if (t < epoch) {
            const pad = document.createElement("div");
            pad.className = "live-activity-cell pad";
            grid.appendChild(pad);
            continue;
        }
        grid.appendChild(buildActivityCell(dayKeyFromTime(t)));
    }
    const wrap = document.createElement("div");
    wrap.className = "live-activity-grid-wrap";
    wrap.appendChild(grid);
    const liveCount = activityDays.size;
    const note = document.createElement("p");
    note.className = "live-activity-note";
    note.textContent = liveCount === 1 ? "1 day live" : `${liveCount} days live`;
    box.append(wrap, note);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function buildActivityCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "live-about-panel live-activity-card";
    const head = document.createElement("div");
    head.className = "live-activity-head";
    const title = document.createElement("div");
    title.className = "live-about-panel-title";
    title.textContent = "Stream activity";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "live-activity-expand";
    expand.setAttribute("aria-label", "Open full stream activity");
    expand.title = "Full view";
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener("click", openActivityHistory);
    head.append(title, expand);
    card.appendChild(head);
    card.appendChild(buildActivityCells(30));
    return card;
}

let activityCardRef: HTMLElement | null = null;
let panelCardRefs: HTMLElement[] = [];
let aboutLayoutWired = false;
let aboutLayoutTimer: number | null = null;

function scheduleAboutLayout(): void {
    if (aboutLayoutTimer !== null) return;
    aboutLayoutTimer = window.setTimeout(() => {
        aboutLayoutTimer = null;
        layoutAboutCards();
    }, 50);
}

function layoutAboutCards(): void {
    if (!aboutLayoutWired) {
        aboutLayoutWired = true;
        window.addEventListener("resize", scheduleAboutLayout);
    }
    const cards: HTMLElement[] = [];
    if (activityCardRef) cards.push(activityCardRef);
    cards.push(...panelCardRefs);
    aboutPanelsEl.replaceChildren();
    if (!cards.length) return;
    const width = aboutPanelsEl.clientWidth || 640;
    const count = Math.max(1, Math.floor((width + 14) / 234));
    const cols: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
        const col = document.createElement("div");
        col.className = "live-about-col";
        cols.push(col);
        aboutPanelsEl.appendChild(col);
    }
    for (const card of cards) {
        let target = cols[0]!;
        for (const col of cols) {
            if (col.offsetHeight < target.offsetHeight) target = col;
        }
        target.appendChild(card);
        for (const img of Array.from(card.querySelectorAll("img"))) {
            if (!img.complete && !img.dataset["relayout"]) {
                img.dataset["relayout"] = "1";
                img.addEventListener("load", scheduleAboutLayout, { once: true });
            }
        }
    }
}

function mountActivityCard(): void {
    activityCardRef = buildActivityCard();
    layoutAboutCards();
    aboutPanelsEl.hidden = false;
    aboutPanelsSectionEl.hidden = false;
}

export function loadStreamActivity(username: string): void {
    if (activityLoadedFor === username) {
        mountActivityCard();
        return;
    }
    activityDays = new Set();
    mountActivityCard();
    void fetch(`/api/live/activity/${encodeURIComponent(username)}`)
        .then(res => res.ok ? res.json() as Promise<{ days?: unknown }> : null)
        .then(data => {
            if (!data) return;
            activityLoadedFor = username;
            const days = Array.isArray(data.days) ? data.days.filter((d): d is string => typeof d === "string") : [];
            activityDays = new Set(days.filter(d => d >= ACTIVITY_EPOCH));
            mountActivityCard();
        })
        .catch(() => {});
}

function updatePanelsSectionVisibility(): void {
    aboutPanelsSectionEl.hidden = false;
    aboutPanelsActionsEl.hidden = !isOwner;
}

function renderPanels(panels: ProfilePanel[]): void {
    currentPanels = panels;
    panelCardRefs = panels.map(panel => buildPanelCard(panel, isOwner));
    updatePanelsSectionVisibility();
    layoutAboutCards();
}

function buildClipCard(channel: string, clip: AboutClip): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "live-about-clip";
    a.href = `/${channel}/clip/${encodeURIComponent(clip.id)}`;
    const thumb = document.createElement("div");
    thumb.className = "live-about-clip-thumb";
    if (clip.poster) {
        const img = document.createElement("img");
        img.className = "live-about-clip-poster";
        img.src = clip.poster;
        img.alt = "";
        img.loading = "lazy";
        thumb.appendChild(img);
    }
    const date = document.createElement("div");
    date.className = "live-about-clip-date";
    date.textContent = relativeDate(clip.createdAt);
    thumb.appendChild(date);
    const views = document.createElement("div");
    views.className = "live-about-clip-views";
    views.textContent = `${formatCompactCount(clip.views)} views`;
    thumb.appendChild(views);
    a.appendChild(thumb);
    const title = document.createElement("div");
    title.className = "live-about-clip-title";
    title.textContent = clip.title;
    a.appendChild(title);
    return a;
}

function renderClips(channel: string, clips: AboutClip[]): void {
    aboutClipsRowEl.replaceChildren();
    if (!clips.length) {
        aboutClipsEl.hidden = true;
        return;
    }
    for (const clip of clips) aboutClipsRowEl.appendChild(buildClipCard(channel, clip));
    aboutClipsEl.hidden = false;
}

export function mountAboutCard(profile: Profile | null): void {
    applyChannelIdentity(profile);
    const username = profile?.username || ctx.displayUsername;
    aboutHeadingEl.textContent = username ? `About ${username}` : "";
    aboutFollowersEl.textContent = profile ? followerLabel(profile.followers) : "";
    aboutBioEl.textContent = profile?.bio ?? "";
    aboutBioEl.hidden = !profile?.bio;
    const badgesEl = document.getElementById("live-about-badges");
    if (badgesEl) {
        badgesEl.replaceChildren();
        const badges = profile?.badges ?? [];
        badgesEl.hidden = badges.length === 0;
        for (const badge of badges) {
            const img = document.createElement("img");
            img.src = subscriberBadgeAssetPath(badge);
            img.alt = badge;
            img.title = subscriberBadgeTitle(badge);
            img.loading = "lazy";
            img.addEventListener("error", () => img.remove());
            badgesEl.appendChild(img);
        }
    }
    aboutLinksEl.replaceChildren();
    const links = profile ? buildProfileLinks(profile.links) : null;
    if (links) aboutLinksEl.appendChild(links);
    aboutBoxEl.hidden = !profile;
    renderPanels(profile?.panels ?? []);
}

let clipsChannel = "";
let clipsSort: ClipsSort = "newest";
let clipsSortWired = false;

function setClipsSort(sort: ClipsSort): void {
    clipsSort = sort;
    aboutClipsSortNewestEl.classList.toggle("active", sort === "newest");
    aboutClipsSortViewsEl.classList.toggle("active", sort === "views");
}

function wireClipsSortOnce(): void {
    if (clipsSortWired) return;
    clipsSortWired = true;
    aboutClipsSortNewestEl.addEventListener("click", () => {
        if (clipsSort === "newest") return;
        setClipsSort("newest");
        void loadChannelClips(clipsChannel, clipsSort).then(clips => renderClips(clipsChannel, clips));
    });
    aboutClipsSortViewsEl.addEventListener("click", () => {
        if (clipsSort === "views") return;
        setClipsSort("views");
        void loadChannelClips(clipsChannel, clipsSort).then(clips => renderClips(clipsChannel, clips));
    });
}

export function loadAboutClips(username: string): void {
    clipsChannel = username;
    setClipsSort("newest");
    wireClipsSortOnce();
    aboutClipsEl.hidden = true;
    aboutClipsRowEl.replaceChildren();
    void loadChannelClips(username, clipsSort).then(clips => renderClips(username, clips));
}

function dashAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = sessionStorage.getItem("dash_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

function cardModalHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", ...dashAuthHeaders() };
}

let cardType: CardType = "text";
let selectedCardFile: File | null = null;

function setCardType(type: CardType): void {
    cardType = type;
    cardModalTypeTextEl.classList.toggle("active", type === "text");
    cardModalTypeImageEl.classList.toggle("active", type === "image");
    cardModalBodyInputEl.hidden = type !== "text";
    cardModalImageGroupEl.hidden = type !== "image";
    cardModalErrorEl.textContent = "";
}

function resetCardModal(): void {
    cardModalTitleInputEl.value = "";
    cardModalBodyInputEl.value = "";
    cardModalLinkInputEl.value = "";
    cardModalFileInputEl.value = "";
    cardModalFileNameEl.textContent = "No file selected";
    selectedCardFile = null;
    cardModalErrorEl.textContent = "";
    cardModalSubmitEl.disabled = false;
    setCardType("text");
}

function closeCardModal(): void {
    if (cardModalEl.hidden) return;
    cardModalEl.hidden = true;
    closeDismissibleSurface(cardModalEl);
}

function openCardModal(): void {
    resetCardModal();
    cardModalEl.hidden = false;
    openDismissibleSurface(cardModalEl, closeCardModal);
    cardModalTitleInputEl.focus();
}

async function refreshOwnedProfile(): Promise<void> {
    const profile = await loadProfile(ownerChannel);
    mountAboutCard(profile);
}

async function deleteCard(id: string): Promise<void> {
    if (!id) return;
    if (!confirm("Delete this card? This cannot be undone.")) return;
    try {
        await fetch(`${API_BASE}/profile/me/panels/${id}`, {
            method: "DELETE",
            credentials: "include",
            headers: dashAuthHeaders(),
        });
    } catch {}
    void refreshOwnedProfile();
}

async function uploadCardImage(id: string, file: File): Promise<{ ok: boolean; error: string | null }> {
    try {
        const bytes = await file.arrayBuffer();
        const res = await fetch(`${API_BASE}/profile/me/panels/${id}/image`, {
            method: "POST",
            credentials: "include",
            headers: { ...dashAuthHeaders(), "Content-Type": file.type },
            body: bytes,
        });
        if (res.ok) return { ok: true, error: null };
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: errBody.error && errBody.error.trim() ? errBody.error : null };
    } catch {
        return { ok: false, error: null };
    }
}

async function submitCardModal(): Promise<void> {
    const title = cardModalTitleInputEl.value.trim();
    const body = cardModalBodyInputEl.value.trim();
    const linkUrl = cardType === "image" ? cardModalLinkInputEl.value.trim() : "";
    const errors = validateCardForm({ type: cardType, body, linkUrl, hasFile: selectedCardFile !== null });
    cardModalErrorEl.textContent = "";
    const firstError = errors.body ?? errors.file ?? errors.linkUrl;
    if (firstError) {
        cardModalErrorEl.textContent = firstError;
        return;
    }
    if (cardType === "image" && selectedCardFile) {
        const sizeError = cardImageError(selectedCardFile);
        if (sizeError) {
            cardModalErrorEl.textContent = sizeError;
            return;
        }
    }
    cardModalSubmitEl.disabled = true;
    const payload: Record<string, string> = {};
    if (title) payload["title"] = title;
    if (cardType === "text") payload["body"] = body;
    if (cardType === "image" && linkUrl) payload["linkUrl"] = linkUrl;
    try {
        const res = await fetch(`${API_BASE}/profile/me/panels`, {
            method: "POST",
            credentials: "include",
            headers: cardModalHeaders(),
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            if (res.status === 409) {
                cardModalErrorEl.textContent = "You've reached the 12 card limit. Delete a card to add a new one.";
            } else if (res.status === 401) {
                cardModalErrorEl.textContent = "Your session expired. Sign in again to add cards.";
            } else {
                const errBody = await res.json().catch(() => ({})) as { error?: string };
                cardModalErrorEl.textContent = errBody.error || "Could not add this card. Try again.";
            }
            cardModalSubmitEl.disabled = false;
            return;
        }
        const created = await res.json().catch(() => ({})) as { id?: string | number };
        if (cardType === "image" && selectedCardFile && created.id !== undefined) {
            const uploaded = await uploadCardImage(String(created.id), selectedCardFile);
            if (!uploaded.ok) {
                await fetch(`${API_BASE}/profile/me/panels/${created.id}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: dashAuthHeaders(),
                }).catch(() => {});
                cardModalErrorEl.textContent = uploaded.error || "Could not upload the image. Try again.";
                cardModalSubmitEl.disabled = false;
                return;
            }
        }
        closeCardModal();
        void refreshOwnedProfile();
    } catch {
        cardModalErrorEl.textContent = "Could not reach the server. Try again.";
        cardModalSubmitEl.disabled = false;
    }
}

let ownerCardsWired = false;

function wireOwnerCardsOnce(): void {
    if (ownerCardsWired) return;
    ownerCardsWired = true;
    aboutAddCardBtnEl.addEventListener("click", openCardModal);
    cardModalCloseEl.addEventListener("click", closeCardModal);
    cardModalEl.addEventListener("click", (event) => {
        if (event.target === cardModalEl) closeCardModal();
    });
    cardModalTypeTextEl.addEventListener("click", () => setCardType("text"));
    cardModalTypeImageEl.addEventListener("click", () => setCardType("image"));
    cardModalFileBtnEl.addEventListener("click", () => cardModalFileInputEl.click());
    cardModalFileInputEl.addEventListener("change", () => {
        const file = cardModalFileInputEl.files?.[0] ?? null;
        selectedCardFile = file;
        cardModalFileNameEl.textContent = file ? file.name : "No file selected";
        cardModalErrorEl.textContent = "";
    });
    cardModalFormEl.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitCardModal();
    });
}

export function initOwnerCards(channel: string): void {
    ownerChannel = channel.toLowerCase();
    isOwner = false;
    updatePanelsSectionVisibility();
    void (async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
            if (!res.ok) return;
            const info = (await res.json()) as { kind?: unknown; username?: unknown } | null;
            if (ownerChannel !== channel.toLowerCase()) return;
            isOwner = viewerOwnsChannel(info, ownerChannel);
            if (isOwner) wireOwnerCardsOnce();
            renderPanels(currentPanels);
        } catch {}
    })();
}
