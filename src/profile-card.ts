import { hashColor } from "./chat/text.ts";
import { PLATFORM_LABELS, PLATFORM_PATHS } from "./platform-icons.ts";
import { normalizePanels, type ProfilePanel } from "./live/about/panels.ts";
import { normalizeAchievements, type Achievement } from "./live/about/achievements.ts";

export type { ProfilePanel } from "./live/about/panels.ts";
export type { Achievement } from "./live/about/achievements.ts";

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
    badges: string[];
    streamer: boolean;
    createdAt: number | null;
    achievements: Achievement[];
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
            badges: Array.isArray(data.badges) ? data.badges.filter((b): b is string => typeof b === "string") : [],
            streamer: data.streamer === true,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : null,
            achievements: normalizeAchievements(data.achievements),
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
        wrap.appendChild(a);
    }
    return wrap;
}
