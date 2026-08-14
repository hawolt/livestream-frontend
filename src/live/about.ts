import { renderProfileCard, type Profile, type ProfilePanel } from "../profile-card.ts";
import { isSafeHttpLink } from "./about/panels.ts";
import { loadChannelClips, type AboutClip } from "./about/clips.ts";
import { relativeDate } from "./about/relative-date.ts";
import { aboutCardEl, aboutClipsEl, aboutClipsRowEl, aboutPanelsEl } from "./dom.ts";

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

function renderPanels(panels: ProfilePanel[]): void {
    aboutPanelsEl.replaceChildren();
    if (!panels.length) {
        aboutPanelsEl.hidden = true;
        return;
    }
    for (const panel of panels) aboutPanelsEl.appendChild(buildPanelCard(panel));
    aboutPanelsEl.hidden = false;
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
    renderProfileCard(aboutCardEl, profile);
    renderPanels(profile?.panels ?? []);
}

export function loadAboutClips(username: string): void {
    aboutClipsEl.hidden = true;
    aboutClipsRowEl.replaceChildren();
    void loadChannelClips(username).then(clips => renderClips(username, clips));
}
