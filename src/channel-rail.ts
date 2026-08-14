import { API_BASE } from "./api.ts";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "./live/icons.ts";
import { readLocalStorage, writeLocalStorage } from "./storage.ts";

const RAIL_COLLAPSED_KEY = "live-channel-rail-collapsed";
const RAIL_POLL_MS = 180000;
const FOLLOW_REFRESH_MS = 60000;

export interface ChannelRailElements {
    rail: HTMLElement;
    toggle: HTMLButtonElement;
    glyph: HTMLElement;
    list: HTMLElement;
    status: HTMLElement;
}

export interface ChannelRailOptions {
    elements: ChannelRailElements;
    getActiveUsername: () => string;
    onCollapsedChange?: () => void;
    isVisible?: () => boolean;
    linkTarget?: string;
}

export interface ChannelRailHandle {
    start: () => void;
    syncVisibility: () => void;
    refresh: () => void;
}

interface ChannelRailStream {
    username: string;
    title: string;
    category: string | null;
    viewers: number;
}

interface RailItem {
    root: HTMLAnchorElement;
    name: HTMLElement;
    category: HTMLElement;
    viewers: HTMLElement;
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

function sectionRow(text: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "live-channel-section-row";
    row.appendChild(sectionLabel(text));
    return row;
}

function sectionDivider(): HTMLDivElement {
    const divider = document.createElement("div");
    divider.className = "live-channel-section-divider";
    return divider;
}

export function createChannelRail(options: ChannelRailOptions): ChannelRailHandle {
    const { elements, getActiveUsername, onCollapsedChange, isVisible, linkTarget } = options;

    let railLoading = false;
    let railReloadRequested = false;
    let railStarted = false;
    let railWasVisible = false;
    let followedUsernames = new Set<string>();
    let followedLoadedAt = 0;
    const railItems = new Map<string, RailItem>();

    const compactViewerFormatter = new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
    });

    const followedRow = sectionRow("Following");
    const liveRow = sectionRow("Live channels");
    const railDivider = sectionDivider();

    function withToggle(row: HTMLElement): HTMLElement {
        row.appendChild(elements.toggle);
        return row;
    }

    function updateRailItem(item: RailItem, stream: ChannelRailStream): void {
        const normalizedUsername = stream.username.toLowerCase();
        const category = stream.category?.trim() || "Other";
        const title = stream.title.trim() || "Untitled stream";
        item.root.href = `/${encodeURIComponent(normalizedUsername)}`;
        item.root.title = `${stream.username} | ${title} | ${category}`;
        item.root.setAttribute("aria-label", `${stream.username}, ${title}, ${category}, ${stream.viewers.toLocaleString()} viewers`);
        const active = normalizedUsername === getActiveUsername();
        item.root.classList.toggle("active", active);
        if (active) item.root.setAttribute("aria-current", "page");
        else item.root.removeAttribute("aria-current");
        item.name.textContent = stream.username;
        item.category.textContent = category;
        item.viewers.textContent = compactViewerFormatter.format(stream.viewers);
    }

    function railItem(stream: ChannelRailStream): HTMLAnchorElement {
        const normalizedUsername = stream.username.toLowerCase();
        const existing = railItems.get(normalizedUsername);
        if (existing) {
            updateRailItem(existing, stream);
            return existing.root;
        }

        const link = document.createElement("a");
        link.className = "live-channel-item";
        if (linkTarget) link.target = linkTarget;

        const avatar = document.createElement("span");
        avatar.className = "live-channel-avatar";
        avatar.textContent = stream.username.slice(0, 1);
        const avatarImg = document.createElement("img");
        avatarImg.className = "live-channel-avatar-img";
        avatarImg.src = `/api/live/profile/${encodeURIComponent(normalizedUsername)}/avatar`;
        avatarImg.alt = "";
        avatarImg.loading = "lazy";
        avatarImg.onerror = () => avatarImg.remove();
        avatar.appendChild(avatarImg);

        const name = document.createElement("span");
        name.className = "live-channel-name";

        const viewerCount = document.createElement("span");
        viewerCount.className = "live-channel-viewers";

        const nameRow = document.createElement("span");
        nameRow.className = "live-channel-name-row";
        nameRow.append(name, viewerCount);

        const categoryEl = document.createElement("span");
        categoryEl.className = "live-channel-category";

        const copy = document.createElement("span");
        copy.className = "live-channel-copy";
        copy.append(nameRow, categoryEl);

        link.append(avatar, copy);

        const item: RailItem = { root: link, name, category: categoryEl, viewers: viewerCount };
        railItems.set(normalizedUsername, item);
        updateRailItem(item, stream);
        return link;
    }

    function setRailStatus(label: string | null): void {
        elements.status.textContent = label ?? "";
        elements.status.hidden = label === null;
    }

    function reconcileRailChildren(nodes: Node[]): void {
        const activeElement = document.activeElement;
        const focused = activeElement instanceof HTMLElement && elements.list.contains(activeElement)
            ? activeElement
            : null;
        const retained = new Set(nodes);
        for (const child of Array.from(elements.list.childNodes)) {
            if (!retained.has(child)) child.remove();
        }
        nodes.forEach((node, index) => {
            const current = elements.list.childNodes[index] ?? null;
            if (current !== node) elements.list.insertBefore(node, current);
        });
        if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }

    function renderRail(streams: ChannelRailStream[]): void {
        const followed = streams.filter((stream) => followedUsernames.has(stream.username.toLowerCase()));
        const others = streams.filter((stream) => !followedUsernames.has(stream.username.toLowerCase()));
        followed.sort(byViewersThenName);
        others.sort(byViewersThenName);
        const nodes: Node[] = [];
        if (followed.length > 0) {
            nodes.push(withToggle(followedRow), ...followed.map(railItem));
            if (others.length > 0) nodes.push(railDivider, liveRow);
        } else {
            nodes.push(withToggle(liveRow));
        }
        nodes.push(...others.map(railItem));
        const liveUsernames = new Set(streams.map((stream) => stream.username.toLowerCase()));
        for (const username of railItems.keys()) {
            if (!liveUsernames.has(username)) railItems.delete(username);
        }
        reconcileRailChildren(nodes);
        setRailStatus(streams.length === 0 ? "No one is live right now" : null);
    }

    async function loadFollowedUsernames(): Promise<void> {
        const now = Date.now();
        if (now - followedLoadedAt < FOLLOW_REFRESH_MS) return;
        followedLoadedAt = now;
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
        if (railLoading) {
            railReloadRequested = true;
            return;
        }
        if (!railVisible()) return;
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
            if (elements.list.querySelector(".live-channel-item") === null) {
                reconcileRailChildren([withToggle(liveRow)]);
                setRailStatus("Live channels unavailable");
            }
        } finally {
            railLoading = false;
            if (railReloadRequested) {
                railReloadRequested = false;
                void loadRail();
            }
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
        document.body.classList.toggle("rail-collapsed", collapsed);
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
            setRailCollapsed(!document.body.classList.contains("rail-collapsed"));
        });
        elements.rail.addEventListener("transitionend", (ev) => {
            if (ev.target === elements.rail && ev.propertyName === "width") onCollapsedChange?.();
        });
        document.addEventListener("visibilitychange", syncVisibility);
        window.addEventListener("follow-changed", () => {
            followedLoadedAt = 0;
            void loadRail();
        });
        window.setInterval(() => void loadRail(), RAIL_POLL_MS);
        syncVisibility();
    }

    return { start, syncVisibility, refresh: (): void => void loadRail() };
}
