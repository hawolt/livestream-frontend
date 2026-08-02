import { API_BASE } from "./api.ts";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "./live/icons.ts";
import { readLocalStorage, writeLocalStorage } from "./storage.ts";

const RAIL_COLLAPSED_KEY = "live-channel-rail-collapsed";
const RAIL_POLL_MS = 10000;

export interface ChannelRailElements {
    rail: HTMLElement;
    toggle: HTMLButtonElement;
    glyph: HTMLElement;
    list: HTMLElement;
    count: HTMLElement;
    status: HTMLElement;
}

export interface ChannelRailOptions {
    elements: ChannelRailElements;
    getActiveUsername: () => string;
    onCollapsedChange?: () => void;
    isVisible?: () => boolean;
}

export interface ChannelRailHandle {
    start: () => void;
    syncVisibility: () => void;
}

interface ChannelRailStream {
    username: string;
    title: string;
    category: string | null;
    viewers: number;
}

function normalizeStream(value: unknown): ChannelRailStream | null {
    if (!value || typeof value !== "object") return null;
    const stream = value as Partial<ChannelRailStream>;
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

function byViewersThenName(a: ChannelRailStream, b: ChannelRailStream): number {
    return b.viewers - a.viewers || a.username.toLowerCase().localeCompare(b.username.toLowerCase());
}

function sectionLabel(text: string): HTMLSpanElement {
    const label = document.createElement("span");
    label.className = "live-channel-section-label";
    label.textContent = text;
    return label;
}

function sectionDivider(): HTMLDivElement {
    const divider = document.createElement("div");
    divider.className = "live-channel-section-divider";
    return divider;
}

export function createChannelRail(options: ChannelRailOptions): ChannelRailHandle {
    const { elements, getActiveUsername, onCollapsedChange, isVisible } = options;

    let railLoading = false;
    let railStarted = false;
    let railWasVisible = false;
    let followedUsernames = new Set<string>();

    const compactViewerFormatter = new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
    });

    function railItem(stream: ChannelRailStream): HTMLAnchorElement {
        const normalizedUsername = stream.username.toLowerCase();
        const category = stream.category?.trim() || "No category";
        const title = stream.title.trim() || "Untitled stream";

        const link = document.createElement("a");
        link.className = "live-channel-item";
        link.href = `/${encodeURIComponent(normalizedUsername)}`;
        link.title = `${stream.username} | ${title} | ${category}`;
        link.setAttribute("aria-label", `${stream.username}, ${title}, ${category}, ${stream.viewers.toLocaleString()} viewers`);
        if (normalizedUsername === getActiveUsername()) {
            link.classList.add("active");
            link.setAttribute("aria-current", "page");
        }

        const avatar = document.createElement("span");
        avatar.className = "live-channel-avatar";
        avatar.textContent = stream.username.slice(0, 1);

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

        link.append(avatar, copy, viewerCount);
        return link;
    }

    function setRailStatus(label: string | null): void {
        elements.status.textContent = label ?? "";
        elements.status.hidden = label === null;
    }

    function renderRail(streams: ChannelRailStream[]): void {
        const followed = streams.filter((stream) => followedUsernames.has(stream.username.toLowerCase()));
        const others = streams.filter((stream) => !followedUsernames.has(stream.username.toLowerCase()));
        followed.sort(byViewersThenName);
        others.sort(byViewersThenName);
        elements.count.textContent = streams.length.toLocaleString();
        const nodes: Node[] = [];
        if (followed.length > 0) {
            nodes.push(sectionLabel("Following"), ...followed.map(railItem));
            if (others.length > 0) nodes.push(sectionDivider(), sectionLabel("Live channels"));
        }
        nodes.push(...others.map(railItem));
        elements.list.replaceChildren(...nodes);
        setRailStatus(streams.length === 0 ? "No one is live right now" : null);
    }

    async function loadFollowedUsernames(): Promise<void> {
        try {
            const res = await fetch(`${API_BASE}/follows/mine`, { credentials: "include" });
            if (!res.ok) {
                if (res.status === 401) followedUsernames = new Set();
                return;
            }
            const data = await res.json() as { following?: unknown };
            const values = Array.isArray(data.following) ? data.following : [];
            followedUsernames = new Set(values
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.toLowerCase()));
        } catch {}
    }

    function railVisible(): boolean {
        return document.visibilityState === "visible"
            && elements.rail.offsetParent !== null
            && (isVisible ? isVisible() : true);
    }

    async function loadRail(): Promise<void> {
        if (railLoading || !railVisible()) return;
        railLoading = true;
        try {
            const [res] = await Promise.all([fetch("/api/live/explore"), loadFollowedUsernames()]);
            if (!res.ok) throw new Error("live channels unavailable");
            const data = await res.json() as { streams?: unknown };
            const values = Array.isArray(data.streams) ? data.streams : [];
            const streams = values
                .map(normalizeStream)
                .filter((stream): stream is ChannelRailStream => stream !== null);
            renderRail(streams);
        } catch {
            if (elements.list.childElementCount === 0) {
                elements.count.textContent = "0";
                setRailStatus("Live channels unavailable");
            }
        } finally {
            railLoading = false;
        }
    }

    function syncVisibility(): void {
        if (!railStarted) return;
        const visible = railVisible();
        const becameVisible = visible && !railWasVisible;
        railWasVisible = visible;
        if (becameVisible) void loadRail();
    }

    function setRailCollapsed(collapsed: boolean): void {
        elements.rail.classList.toggle("collapsed", collapsed);
        elements.toggle.setAttribute("aria-expanded", String(!collapsed));
        const label = collapsed ? "Expand live channels" : "Collapse live channels";
        elements.toggle.title = label;
        elements.toggle.setAttribute("aria-label", label);
        elements.glyph.innerHTML = collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_LEFT;
        writeLocalStorage(RAIL_COLLAPSED_KEY, collapsed ? "1" : "0");
        onCollapsedChange?.();
    }

    function start(): void {
        if (railStarted) return;
        railStarted = true;
        setRailCollapsed(readLocalStorage(RAIL_COLLAPSED_KEY) === "1");
        elements.toggle.addEventListener("click", () => {
            setRailCollapsed(!elements.rail.classList.contains("collapsed"));
        });
        elements.rail.addEventListener("transitionend", (ev) => {
            if (ev.target === elements.rail && ev.propertyName === "width") onCollapsedChange?.();
        });
        document.addEventListener("visibilitychange", syncVisibility);
        window.setInterval(() => void loadRail(), RAIL_POLL_MS);
        syncVisibility();
    }

    return { start, syncVisibility };
}
