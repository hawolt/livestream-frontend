import { buildAvatar, buildProfileLinks, followerLabel, loadProfile, type Profile, type ProfilePanel } from "../profile-card.ts";
import { isSafeHttpLink } from "./about/panels.ts";
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
    cardModalFormEl,
    cardModalLinkInputEl,
    cardModalSubmitEl,
    cardModalTitleInputEl,
    channelAvatarWrapEl,
    channelFollowersEl,
} from "./dom.ts";

let currentPanelCount = 0;
let ownerChannel = "";
let isOwner = false;

export function applyChannelIdentity(profile: Profile | null): void {
    channelAvatarWrapEl.replaceChildren();
    if (profile) channelAvatarWrapEl.appendChild(buildAvatar(profile));
    channelFollowersEl.textContent = profile ? followerLabel(profile.followers) : "";
    channelFollowersEl.classList.toggle("hidden", !profile);
}

function buildPanelCard(panel: ProfilePanel): HTMLElement {
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
    return card;
}

function updatePanelsSectionVisibility(): void {
    aboutPanelsSectionEl.hidden = currentPanelCount === 0 && !isOwner;
    aboutPanelsActionsEl.hidden = !isOwner;
}

function renderPanels(panels: ProfilePanel[]): void {
    aboutPanelsEl.replaceChildren();
    currentPanelCount = panels.length;
    aboutPanelsEl.hidden = panels.length === 0;
    for (const panel of panels) aboutPanelsEl.appendChild(buildPanelCard(panel));
    updatePanelsSectionVisibility();
}

function buildClipCard(channel: string, clip: AboutClip): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "live-about-clip";
    a.href = `/${channel}/clip/${encodeURIComponent(clip.id)}`;
    if (clip.poster) {
        const img = document.createElement("img");
        img.className = "live-about-clip-poster";
        img.src = clip.poster;
        img.alt = "";
        img.loading = "lazy";
        a.appendChild(img);
    }
    const views = document.createElement("div");
    views.className = "live-about-clip-views";
    views.textContent = `${formatCompactCount(clip.views)} views`;
    a.appendChild(views);
    const title = document.createElement("div");
    title.className = "live-about-clip-title";
    title.textContent = clip.title;
    a.appendChild(title);
    const date = document.createElement("div");
    date.className = "live-about-clip-date";
    date.textContent = relativeDate(clip.createdAt);
    a.appendChild(date);
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

function cardModalHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("dash_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

function resetCardModal(): void {
    cardModalTitleInputEl.value = "";
    cardModalBodyInputEl.value = "";
    cardModalLinkInputEl.value = "";
    cardModalErrorEl.textContent = "";
    cardModalSubmitEl.disabled = false;
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

async function submitCardModal(): Promise<void> {
    const title = cardModalTitleInputEl.value.trim();
    const body = cardModalBodyInputEl.value.trim();
    const linkUrl = cardModalLinkInputEl.value.trim();
    cardModalErrorEl.textContent = "";
    if (!title && !body) {
        cardModalErrorEl.textContent = "Add a title or body.";
        return;
    }
    if (linkUrl && !isSafeHttpLink(linkUrl)) {
        cardModalErrorEl.textContent = "Link must start with http:// or https://";
        return;
    }
    cardModalSubmitEl.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/profile/me/panels`, {
            method: "POST",
            credentials: "include",
            headers: cardModalHeaders(),
            body: JSON.stringify({ title, body, linkUrl }),
        });
        if (res.ok) {
            closeCardModal();
            void refreshOwnedProfile();
            return;
        }
        if (res.status === 409) {
            cardModalErrorEl.textContent = "You've reached the 12 card limit.";
        } else {
            const errBody = await res.json().catch(() => ({})) as { error?: string };
            cardModalErrorEl.textContent = errBody.error || "Could not add this card. Try again.";
        }
    } catch {
        cardModalErrorEl.textContent = "Could not reach the server. Try again.";
    }
    cardModalSubmitEl.disabled = false;
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
            updatePanelsSectionVisibility();
        } catch {}
    })();
}
