import { API_BASE } from "./api.ts";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "./live/icons.ts";
import { railCardModel } from "./rail-card.ts";
import { readLocalStorage, writeLocalStorage } from "./storage.ts";

const RAIL_COLLAPSED_KEY = "live-channel-rail-collapsed";
const RAIL_POLL_MS = 180000;
const FOLLOW_REFRESH_MS = 60000;
const SCROLLBAR_MIN_PX = 24;

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
    stream: ChannelRailStream;
    offline: boolean;
}

interface RailCardElements {
    root: HTMLElement;
    head: HTMLElement;
    title: HTMLElement;
    meta: HTMLElement;
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
    let followedChannels = new Map<string, string>();
    let followedLoadedAt = 0;
    let card: RailCardElements | null = null;
    let scrollbar: HTMLElement | null = null;
    const railItems = new Map<string, RailItem>();

    const compactViewerFormatter = new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
    });

    const followedRow = sectionRow("Following");
    const liveRow = sectionRow("Live channels");
    const offlineRow = sectionRow("Offline");
    const railDivider = sectionDivider();
    const offlineDivider = sectionDivider();

    function withToggle(row: HTMLElement): HTMLElement {
        row.appendChild(elements.toggle);
        return row;
    }

    function updateRailItem(item: RailItem, stream: ChannelRailStream, offline: boolean): void {
        const normalizedUsername = stream.username.toLowerCase();
        const category = stream.category?.trim() || "Other";
        const title = stream.title.trim() || "Untitled stream";
        item.stream = stream;
        item.offline = offline;
        item.root.href = `/${encodeURIComponent(normalizedUsername)}`;
        item.root.setAttribute("aria-label", offline
            ? `${stream.username}, offline`
            : `${stream.username}, ${title}, ${category}, ${stream.viewers.toLocaleString()} viewers`);
        item.root.classList.toggle("live-channel-item-offline", offline);
        const active = normalizedUsername === getActiveUsername();
        item.root.classList.toggle("active", active);
        if (active) item.root.setAttribute("aria-current", "page");
        else item.root.removeAttribute("aria-current");
        item.name.textContent = stream.username;
        item.category.textContent = offline ? "Offline" : category;
        item.viewers.textContent = offline ? "" : compactViewerFormatter.format(stream.viewers);
    }

    function railItem(stream: ChannelRailStream, offline = false): HTMLAnchorElement {
        const normalizedUsername = stream.username.toLowerCase();
        const existing = railItems.get(normalizedUsername);
        if (existing) {
            updateRailItem(existing, stream, offline);
            return existing.root;
        }

        const link = document.createElement("a");
        link.className = "live-channel-item";
        link.dataset.channel = normalizedUsername;
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

        const item: RailItem = { root: link, name, category: categoryEl, viewers: viewerCount, stream, offline };
        railItems.set(normalizedUsername, item);
        updateRailItem(item, stream, offline);
        return link;
    }

    function ensureCard(): RailCardElements {
        if (card) return card;
        const root = document.createElement("div");
        root.className = "live-channel-card";
        root.hidden = true;
        const head = document.createElement("div");
        head.className = "live-channel-card-head";
        const title = document.createElement("div");
        title.className = "live-channel-card-title";
        const meta = document.createElement("div");
        meta.className = "live-channel-card-meta";
        root.append(head, title, meta);
        document.body.appendChild(root);
        card = { root, head, title, meta };
        return card;
    }

    function hideCard(): void {
        if (card) card.root.hidden = true;
    }

    function showCard(item: RailItem): void {
        const model = railCardModel({
            username: item.stream.username,
            title: item.stream.title,
            category: item.stream.category,
            viewers: item.stream.viewers,
            offline: item.offline,
            collapsed: document.body.classList.contains("rail-collapsed"),
        });
        if (!model) {
            hideCard();
            return;
        }
        const parts = ensureCard();
        parts.head.textContent = model.head;
        parts.head.hidden = model.head === "";
        parts.title.textContent = model.title;
        parts.title.hidden = model.title === "";
        parts.meta.textContent = model.live
            ? `Live | ${compactViewerFormatter.format(model.viewers)} viewers`
            : item.offline ? "Offline" : "";
        parts.meta.hidden = parts.meta.textContent === "";
        parts.root.hidden = false;
        const rect = item.root.getBoundingClientRect();
        parts.root.style.left = `${Math.round(rect.right + 8)}px`;
        parts.root.style.top = "0px";
        const lowest = Math.max(8, window.innerHeight - parts.root.offsetHeight - 8);
        parts.root.style.top = `${Math.round(Math.min(Math.max(8, rect.top), lowest))}px`;
    }

    function ensureScrollbar(): HTMLElement | null {
        if (scrollbar) return scrollbar;
        const host = elements.list.parentElement;
        if (!host) return null;
        const bar = document.createElement("div");
        bar.className = "live-channel-scrollbar";
        bar.hidden = true;
        host.appendChild(bar);
        scrollbar = bar;
        return bar;
    }

    function syncScrollbar(): void {
        const bar = ensureScrollbar();
        if (!bar) return;
        const track = elements.list.clientHeight;
        const content = elements.list.scrollHeight;
        if (track <= 0 || content <= track + 1) {
            bar.hidden = true;
            return;
        }
        const height = Math.max(SCROLLBAR_MIN_PX, Math.round(track * track / content));
        const span = Math.max(0, track - height);
        const progress = Math.min(1, Math.max(0, elements.list.scrollTop / (content - track)));
        bar.hidden = false;
        bar.style.height = `${height}px`;
        bar.style.transform = `translateY(${Math.round(progress * span)}px)`;
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
        const followed = streams.filter((stream) => followedChannels.has(stream.username.toLowerCase()));
        const others = streams.filter((stream) => !followedChannels.has(stream.username.toLowerCase()));
        followed.sort(byViewersThenName);
        others.sort(byViewersThenName);
        const liveUsernames = new Set(streams.map((stream) => stream.username.toLowerCase()));
        const offline: ChannelRailStream[] = [...followedChannels]
            .filter(([normalized]) => !liveUsernames.has(normalized))
            .map(([, display]) => ({ username: display, title: "", category: null, viewers: 0 }))
            .sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
        const nodes: Node[] = [];
        if (followed.length > 0) {
            nodes.push(withToggle(followedRow), ...followed.map((stream) => railItem(stream)));
            if (others.length > 0) nodes.push(railDivider, liveRow);
        } else {
            nodes.push(withToggle(liveRow));
        }
        nodes.push(...others.map((stream) => railItem(stream)));
        if (offline.length > 0) {
            nodes.push(offlineDivider, offlineRow, ...offline.map((stream) => railItem(stream, true)));
        }
        const retained = new Set(liveUsernames);
        for (const stream of offline) retained.add(stream.username.toLowerCase());
        for (const username of railItems.keys()) {
            if (!retained.has(username)) railItems.delete(username);
        }
        reconcileRailChildren(nodes);
        syncScrollbar();
        setRailStatus(streams.length === 0 && offline.length === 0 ? "No one is live right now" : null);
    }

    async function loadFollowedUsernames(): Promise<void> {
        const now = Date.now();
        if (now - followedLoadedAt < FOLLOW_REFRESH_MS) return;
        followedLoadedAt = now;
        try {
            const res = await fetch(`${API_BASE}/follows/mine`, { credentials: "include" });
            if (!res.ok) {
                if (res.status === 401) followedChannels = new Map();
                return;
            }
            const data = await res.json() as { following?: unknown };
            const values = Array.isArray(data.following) ? data.following : [];
            followedChannels = new Map(values
                .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                .map((value) => [value.trim().toLowerCase(), value.trim()]));
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
        hideCard();
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
        elements.list.addEventListener("mouseover", (ev) => {
            const hovered = ev.target instanceof Element ? ev.target.closest(".live-channel-item") : null;
            const item = hovered instanceof HTMLElement ? railItems.get(hovered.dataset.channel ?? "") : undefined;
            if (item) showCard(item);
            else hideCard();
        });
        elements.list.addEventListener("mouseleave", hideCard);
        elements.list.addEventListener("scroll", () => {
            hideCard();
            syncScrollbar();
        }, { passive: true });
        window.addEventListener("blur", hideCard);
        window.addEventListener("resize", syncScrollbar);
        elements.rail.addEventListener("transitionend", (ev) => {
            if (ev.target !== elements.rail || ev.propertyName !== "width") return;
            onCollapsedChange?.();
            syncScrollbar();
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
