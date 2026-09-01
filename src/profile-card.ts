import { hashColor } from "./chat/text.ts";
import { PLATFORM_LABELS, PLATFORM_PATHS } from "./platform-icons.ts";
import { normalizePanels, type ProfilePanel } from "./live/about/panels.ts";

export type { ProfilePanel } from "./live/about/panels.ts";

export interface ProfileLink {
    label: string;
    url: string;
    platform: string;
    icon: string;
    iconLabel: string;
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
    badges: string[];
    streamer: boolean;
    createdAt: number | null;
    followingSince: number | null;
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
        const icon = typeof (item as { icon?: unknown }).icon === "string" ? (item as { icon: string }).icon : "";
        const iconLabel = typeof (item as { iconLabel?: unknown }).iconLabel === "string" ? (item as { iconLabel: string }).iconLabel : "";
        if (!label || !url) continue;
        out.push({ label, url, platform, icon, iconLabel });
    }
    return out;
}

export async function loadProfile(username: string, channel?: string): Promise<Profile | null> {
    if (!username) return null;
    try {
        const query = channel ? `?channel=${encodeURIComponent(channel)}` : "";
        const res = await fetch(`/api/live/profile/${encodeURIComponent(username)}${query}`);
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
            badges: Array.isArray(data.badges) ? data.badges.filter((b): b is string => typeof b === "string") : [],
            streamer: data.streamer === true,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : null,
            followingSince: typeof data.followingSince === "number" && Number.isFinite(data.followingSince)
                ? data.followingSince : null,
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

export function buildAvatar(profile: Profile): HTMLElement {
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

function buildLinkGlyph(d: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "profile-card-link-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
}

function linkMonogramLetter(url: string): string {
    let host = "";
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return "?";
    }
    if (host.startsWith("www.")) host = host.slice(4);
    return (host.replace(/[^a-z0-9]/g, "").charAt(0) || "?").toUpperCase();
}

function buildLinkMonogram(url: string): HTMLElement {
    const mark = document.createElement("span");
    mark.className = "profile-card-link-monogram";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = linkMonogramLetter(url);
    return mark;
}

export function followerLabel(count: number): string {
    return `${count.toLocaleString()} follower${count === 1 ? "" : "s"}`;
}

export function buildProfileLinks(links: ProfileLink[]): HTMLElement | null {
    const safeLinks = links.filter(link => isHttpsUrl(link.url));
    if (!safeLinks.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "profile-card-links";
    for (const link of safeLinks) {
        const a = document.createElement("a");
        a.className = "profile-card-link";
        a.href = link.url;
        const platformPath = PLATFORM_PATHS[link.platform];
        if (platformPath) {
            a.appendChild(buildLinkGlyph(platformPath));
            a.title = PLATFORM_LABELS[link.platform] ?? link.platform;
        } else if (link.icon) {
            a.appendChild(buildLinkGlyph(link.icon));
            if (link.iconLabel) a.title = link.iconLabel;
        } else {
            a.appendChild(buildLinkMonogram(link.url));
        }
        const text = document.createElement("span");
        text.textContent = link.label;
        a.appendChild(text);
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow ugc";
        a.referrerPolicy = "no-referrer";
        wrap.appendChild(a);
    }
    return wrap;
}
