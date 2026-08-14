import { buildAvatar, buildProfileLinks, followerLabel, loadProfile, type Profile, type ProfilePanel } from "../profile-card.ts";
import { isSafeHttpLink } from "./about/panels.ts";
import { cardImageError, validateCardForm, type CardType } from "./about/card-form.ts";
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
    if (panel.title) {
        const title = document.createElement("div");
        title.className = "live-about-panel-title";
        title.textContent = panel.title;
        card.appendChild(title);
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
        del.textContent = "×";
        del.addEventListener("click", () => void deleteCard(panel.id));
        card.appendChild(del);
    }
    return card;
}

function updatePanelsSectionVisibility(): void {
    aboutPanelsSectionEl.hidden = currentPanels.length === 0 && !isOwner;
    aboutPanelsActionsEl.hidden = !isOwner;
}

function renderPanels(panels: ProfilePanel[]): void {
    aboutPanelsEl.replaceChildren();
    currentPanels = panels;
    aboutPanelsEl.hidden = panels.length === 0;
    for (const panel of panels) aboutPanelsEl.appendChild(buildPanelCard(panel, isOwner));
    updatePanelsSectionVisibility();
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

async function uploadCardImage(id: string, file: File): Promise<boolean> {
    try {
        const bytes = await file.arrayBuffer();
        const res = await fetch(`${API_BASE}/profile/me/panels/${id}/image`, {
            method: "POST",
            credentials: "include",
            headers: { ...dashAuthHeaders(), "Content-Type": file.type },
            body: bytes,
        });
        return res.ok;
    } catch {
        return false;
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
                cardModalErrorEl.textContent = "You've reached the 12 card limit.";
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
            if (!uploaded) {
                await fetch(`${API_BASE}/profile/me/panels/${created.id}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: dashAuthHeaders(),
                }).catch(() => {});
                cardModalErrorEl.textContent = "Could not upload the image. Try again.";
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
