import { hashColor } from "./chat/text.ts";
import { PLATFORM_LABELS, PLATFORM_PATHS } from "./platform-icons.ts";
import { normalizePanels, type ProfilePanel } from "./live/about/panels.ts";

export type { ProfilePanel } from "./live/about/panels.ts";

export interface ProfileLink {
    label: string;
    url: string;
    platform: string;
}

export interface Profile {
    username: string;
    bio: string;
    links: ProfileLink[];
    followers: number;
    hasAvatar: boolean;
    hasBanner: boolean;
    avatarVersion: number;
    bannerVersion: number;
    panels: ProfilePanel[];
}

function isHttpsUrl(url: string): boolean {
    try {
        return new URL(url).protocol === "https:";
    } catch {
        return false;
    }
}

function parseLinks(raw: unknown): ProfileLink[] {
    if (!Array.isArray(raw)) return [];
    const out: ProfileLink[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const label = typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label : "";
        const url = typeof (item as { url?: unknown }).url === "string" ? (item as { url: string }).url : "";
        const platform = typeof (item as { platform?: unknown }).platform === "string" ? (item as { platform: string }).platform : "";
        if (!label || !url) continue;
        out.push({ label, url, platform });
    }
    return out;
}

export async function loadProfile(username: string): Promise<Profile | null> {
    if (!username) return null;
    try {
        const res = await fetch(`/api/live/profile/${encodeURIComponent(username)}`);
        if (!res.ok) return null;
        const data = await res.json() as Record<string, unknown>;
        if (typeof data.username !== "string" || !data.username) return null;
        return {
            username: data.username,
            bio: typeof data.bio === "string" ? data.bio : "",
            links: parseLinks(data.links),
            followers: typeof data.followers === "number" ? data.followers : 0,
            hasAvatar: data.hasAvatar === true,
            hasBanner: data.hasBanner === true,
            avatarVersion: typeof data.avatarVersion === "number" ? data.avatarVersion : 0,
            bannerVersion: typeof data.bannerVersion === "number" ? data.bannerVersion : 0,
            panels: normalizePanels(data.panels),
        };
    } catch {
        return null;
    }
}

function avatarUrl(profile: Profile): string {
    return `/api/live/profile/${encodeURIComponent(profile.username)}/avatar?v=${profile.avatarVersion}`;
}

export function offlineArtUrl(profile: Profile): string | null {
    if (!profile.hasBanner) return null;
    return `/api/live/profile/${encodeURIComponent(profile.username)}/banner?v=${profile.bannerVersion}`;
}

function buildAvatar(profile: Profile): HTMLElement {
    if (profile.hasAvatar) {
        const img = document.createElement("img");
        img.className = "profile-card-avatar";
        img.src = avatarUrl(profile);
        img.alt = profile.username;
        img.loading = "lazy";
        return img;
    }
    const fallback = document.createElement("div");
    fallback.className = "profile-card-avatar-fallback";
    fallback.style.backgroundColor = hashColor(profile.username);
    fallback.textContent = profile.username.slice(0, 1).toUpperCase();
    return fallback;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function buildPlatformIcon(platform: string): SVGSVGElement | null {
    const d = PLATFORM_PATHS[platform];
    if (!d) return null;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "profile-card-link-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
}

function followerLabel(count: number): string {
    return `${count.toLocaleString()} follower${count === 1 ? "" : "s"}`;
}

export function renderProfileCard(container: HTMLElement, profile: Profile | null): void {
    container.replaceChildren();
    if (!profile) return;

    const card = document.createElement("div");
    card.className = "profile-card";

    const head = document.createElement("div");
    head.className = "profile-card-head";
    head.appendChild(buildAvatar(profile));

    const identity = document.createElement("div");
    identity.className = "profile-card-identity";
    const username = document.createElement("div");
    username.className = "profile-card-username";
    username.textContent = profile.username;
    const followers = document.createElement("div");
    followers.className = "profile-card-followers";
    followers.textContent = followerLabel(profile.followers);
    identity.append(username, followers);
    head.appendChild(identity);
    card.appendChild(head);

    if (profile.bio) {
        const bio = document.createElement("p");
        bio.className = "profile-card-bio";
        bio.textContent = profile.bio;
        card.appendChild(bio);
    }

    const safeLinks = profile.links.filter(link => isHttpsUrl(link.url));
    if (safeLinks.length) {
        const links = document.createElement("div");
        links.className = "profile-card-links";
        for (const link of safeLinks) {
            const a = document.createElement("a");
            a.className = "profile-card-link";
            a.href = link.url;
            const glyph = buildPlatformIcon(link.platform);
            if (glyph) {
                a.appendChild(glyph);
                a.title = PLATFORM_LABELS[link.platform] ?? link.platform;
            }
            const text = document.createElement("span");
            text.textContent = link.label;
            a.appendChild(text);
            a.target = "_blank";
            a.rel = "noopener noreferrer nofollow ugc";
            a.referrerPolicy = "no-referrer";
            links.appendChild(a);
        }
        card.appendChild(links);
    }

    container.appendChild(card);
}
