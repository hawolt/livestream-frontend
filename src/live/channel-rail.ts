import {
    channelCountEl,
    channelListEl,
    channelRailEl,
    channelRailToggleEl,
    channelRailToggleGlyphEl,
    channelStatusEl,
} from "./dom.ts";
import { readLocalStorage, writeLocalStorage } from "../storage.ts";
import { CHANNEL_RAIL_COLLAPSED_KEY, CHANNEL_RAIL_POLL_MS } from "./constants.ts";
import { type FullscreenDoc } from "./fullscreen.ts";
import { fitChat } from "./layout.ts";
import { ctx } from "./player/context.ts";

interface LiveChannelRailStream {
    username: string;
    title: string;
    category: string | null;
    viewers: number;
}

let railLoading = false;
let railStarted = false;
let railWasVisible = false;

const compactViewerFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
});

function normalizeStream(value: unknown): LiveChannelRailStream | null {
    if (!value || typeof value !== "object") return null;
    const stream = value as Partial<LiveChannelRailStream>;
    if (typeof stream.username !== "string" || stream.username.trim().length === 0) return null;
    return {
        username: stream.username.trim(),
        title: typeof stream.title === "string" ? stream.title : "",
        category: typeof stream.category === "string" ? stream.category : null,
        viewers: typeof stream.viewers === "number" && Number.isFinite(stream.viewers)
            ? Math.max(0, Math.floor(stream.viewers))
            : 0,
    };
}

function railItem(stream: LiveChannelRailStream): HTMLAnchorElement {
    const normalizedUsername = stream.username.toLowerCase();
    const category = stream.category?.trim() || "No category";
    const title = stream.title.trim() || "Untitled stream";

    const link = document.createElement("a");
    link.className = "live-channel-item";
    link.href = `/${encodeURIComponent(normalizedUsername)}`;
    link.title = `${stream.username} | ${title} | ${category}`;
    link.setAttribute("aria-label", `${stream.username}, ${title}, ${category}, ${stream.viewers.toLocaleString()} viewers`);
    if (normalizedUsername === ctx.username) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
    }

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "live-channel-avatar-wrap";

    const avatar = document.createElement("span");
    avatar.className = "live-channel-avatar";
    avatar.textContent = stream.username.slice(0, 1);

    const online = document.createElement("span");
    online.className = "live-channel-online";
    online.setAttribute("aria-hidden", "true");
    avatarWrap.append(avatar, online);

    const copy = document.createElement("span");
    copy.className = "live-channel-copy";

    const name = document.createElement("span");
    name.className = "live-channel-name";
    name.textContent = stream.username;

    const categoryEl = document.createElement("span");
    categoryEl.className = "live-channel-category";
    categoryEl.textContent = category;
    copy.append(name, categoryEl);

    const viewerCount = document.createElement("span");
    viewerCount.className = "live-channel-viewers";
    viewerCount.textContent = compactViewerFormatter.format(stream.viewers);

    link.append(avatarWrap, copy, viewerCount);
    return link;
}

function setRailStatus(label: string | null): void {
    channelStatusEl.textContent = label ?? "";
    channelStatusEl.hidden = label === null;
}

function renderRail(streams: LiveChannelRailStream[]): void {
    streams.sort((a, b) => b.viewers - a.viewers || a.username.localeCompare(b.username));
    channelCountEl.textContent = streams.length.toLocaleString();
    channelListEl.replaceChildren(...streams.map(railItem));
    setRailStatus(streams.length === 0 ? "No one is live right now" : null);
}

function isRailVisible(): boolean {
    const d = document as FullscreenDoc;
    const fullscreenElement = document.fullscreenElement ?? d.webkitFullscreenElement;
    const fullscreenContainsRail = !fullscreenElement
        || fullscreenElement === document.documentElement
        || fullscreenElement.contains(channelRailEl);
    return document.visibilityState === "visible"
        && !document.body.classList.contains("browse-mode")
        && channelRailEl.offsetParent !== null
        && fullscreenContainsRail;
}

async function loadRail(): Promise<void> {
    if (railLoading || !isRailVisible()) return;
    railLoading = true;
    try {
        const res = await fetch("/api/live/explore");
        if (!res.ok) throw new Error("live channels unavailable");
        const data = await res.json() as { streams?: unknown };
        const values = Array.isArray(data.streams) ? data.streams : [];
        const streams = values
            .map(normalizeStream)
            .filter((stream): stream is LiveChannelRailStream => stream !== null);
        renderRail(streams);
    } catch {
        if (channelListEl.childElementCount === 0) {
            channelCountEl.textContent = "0";
            setRailStatus("Live channels unavailable");
        }
    } finally {
        railLoading = false;
    }
}

export function syncChannelRailVisibility(): void {
    if (!railStarted) return;
    const visible = isRailVisible();
    const becameVisible = visible && !railWasVisible;
    railWasVisible = visible;
    if (becameVisible) void loadRail();
}

function setRailCollapsed(collapsed: boolean): void {
    channelRailEl.classList.toggle("collapsed", collapsed);
    channelRailToggleEl.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? "Expand live channels" : "Collapse live channels";
    channelRailToggleEl.title = label;
    channelRailToggleEl.setAttribute("aria-label", label);
    channelRailToggleGlyphEl.textContent = collapsed ? ">" : "<";
    writeLocalStorage(CHANNEL_RAIL_COLLAPSED_KEY, collapsed ? "1" : "0");
    fitChat();
}

export function startChannelRail(): void {
    if (railStarted) return;
    railStarted = true;
    setRailCollapsed(readLocalStorage(CHANNEL_RAIL_COLLAPSED_KEY) === "1");
    channelRailToggleEl.addEventListener("click", () => {
        setRailCollapsed(!channelRailEl.classList.contains("collapsed"));
    });
    channelRailEl.addEventListener("transitionend", (ev) => {
        if (ev.target === channelRailEl && ev.propertyName === "width") fitChat();
    });
    document.addEventListener("visibilitychange", syncChannelRailVisibility);
    window.setInterval(() => void loadRail(), CHANNEL_RAIL_POLL_MS);
    syncChannelRailVisibility();
}
