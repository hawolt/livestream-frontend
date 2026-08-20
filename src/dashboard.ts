import { initSiteNav, setBurgerExtra } from "./nav.ts";
import { reportVisit } from "./visit-beacon.ts";
import { $, $$ } from "./dash/dom.ts";
import "./dash/modal.ts";
import {
    authFetch, setMe, token, loginRedirect, signOutAndRedirect, loadDashboardSession, startSessionRenewal,
    type MeInfo, type TabInfo, type TabModule,
} from "./dash/session.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "./dismissible-surface.ts";
import { motionScrollBehavior } from "./motion.ts";
import { studioBaseUrl, studioTabUrl } from "./dash/studio.ts";

const TAB_LOADERS: Record<string, () => Promise<TabModule>> = {
    stream:           () => import("./dash/tabs/stream.ts"),
    discord:          () => import("./dash/tabs/discord.ts"),
    webhooks:         () => import("./dash/tabs/webhooks.ts"),
    "stream-manager": () => import("./dash/tabs/stream-manager.ts"),
    chatbox:          () => import("./dash/tabs/chatbox.ts"),
    alertbox:         () => import("./dash/tabs/alertbox.ts"),
    multichat:        () => import("./dash/tabs/multichat.ts"),
    "stream-health":  () => import("./dash/tabs/stream-health.ts"),
    "stream-summary": () => import("./dash/tabs/stream-summary.ts"),
    activity:         () => import("./dash/tabs/activity.ts"),
    settings:         () => import("./dash/tabs/settings.ts"),
    integration:      () => import("./dash/tabs/integration.ts"),
    "channel-profile": () => import("./dash/tabs/profile.ts"),
    clips:            () => import("./dash/tabs/clips.ts"),
    subscription:     () => import("./dash/tabs/subscription.ts"),
    achievements:     () => import("./dash/tabs/achievements.ts"),
};

const tabById = new Map<string, TabInfo>();
const loadedModules = new Map<string, TabModule>();
let allTabs: TabInfo[] = [];
let currentTab: string | null = null;
let activationSeq = 0;
let refreshRevision = 0;
let sidebarToggleLabel: HTMLElement | null = null;
let closeSidebarMenu: ((restoreFocus?: boolean) => void) | null = null;
let studioTabs: TabInfo[] = [];
let burgerGroupId = 0;

const DASH_SIDE_LIST_ID = "dash-side-list";

function tabFromLocation(): string | null {
    const m = location.pathname.match(/^\/dashboard(?:\.html)?\/([A-Za-z0-9_-]+)\/?$/);
    if (m) return m[1]!;
    const hash = location.hash.slice(1);
    return hash || null;
}

const STUDIO_LINK_LABELS: Record<string, string> = {
    setup: "Korea Setup",
    ingests: "Ingests",
    "remote-obs": "Remote OBS",
    multistream: "Multistream",
    upgrades: "Upgrades",
};

function studioOnlyTabs(tabs: TabInfo[]): TabInfo[] {
    const out: TabInfo[] = [];
    for (const tab of tabs) {
        if (TAB_LOADERS[tab.id]) continue;
        const label = STUDIO_LINK_LABELS[tab.id];
        if (!label) continue;
        out.push({ ...tab, label });
    }
    return out;
}

function navigationSnapshot(tabs: TabInfo[], studio: TabInfo[]): string {
    return JSON.stringify({
        tabs: tabs.map(tab => ({ id: tab.id, label: tab.label, pane: tab.pane, group: tab.group ?? null })),
        studio: studio.map(tab => ({ id: tab.id, label: tab.label })),
    });
}

function setNoTabsVisible(visible: boolean): void {
    let panel = document.getElementById("dash-no-tabs");
    if (visible && !panel) {
        panel = document.createElement("section");
        panel.id = "dash-no-tabs";
        panel.className = "card empty";
        panel.setAttribute("role", "status");
        panel.textContent = "No dashboard sections are available for this account.";
        $("panes").appendChild(panel);
    }
    if (panel) panel.hidden = !visible;
}

function syncDashboardNavigation(tab: string): void {
    $$(".dash-side-link[data-tab]").forEach(link => {
        const current = link.dataset["tab"] === tab;
        link.classList.toggle("active", current);
        if (current) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

async function activateTab(tab: string, pushState = true): Promise<void> {
    const info = tabById.get(tab);
    if (!info || !TAB_LOADERS[tab]) return;
    const seq = ++activationSeq;
    if (currentTab === tab && loadedModules.has(tab)) return;

    let mod = loadedModules.get(tab);
    try {
        if (!mod) {
            const [html, loaded] = await Promise.all([
                fetch(`/panes/${info.pane}.html`, { cache: "no-cache" }).then(r => {
                    if (!r.ok) throw new Error(`pane ${info.pane}: ${r.status}`);
                    return r.text();
                }),
                TAB_LOADERS[tab]!(),
            ]);
            if (seq !== activationSeq) return;
            if (loadedModules.has(tab)) {
                mod = loadedModules.get(tab)!;
            } else {
                $("panes").insertAdjacentHTML("beforeend", html);
                mod = loaded;
                const pane = $(`pane-${tab}`);
                try {
                    mod.init(pane);
                } catch (error) {
                    pane.remove();
                    throw error;
                }
                loadedModules.set(tab, mod);
            }
        }
    } catch {
        if (seq === activationSeq) alert("Could not load this dashboard section. Check your connection and try again.");
        return;
    }
    if (seq !== activationSeq || !mod) return;

    if (currentTab && currentTab !== tab) {
        loadedModules.get(currentTab)?.deactivate?.();
    }
    currentTab = tab;
    setNoTabsVisible(false);

    syncDashboardNavigation(tab);
    const btn = document.querySelector<HTMLElement>(`.dash-side-link[data-tab="${tab}"]`);
    btn?.scrollIntoView({ behavior: motionScrollBehavior(), block: "nearest", inline: "center" });
    if (sidebarToggleLabel) sidebarToggleLabel.textContent = info.label;
    closeSidebarMenu?.(true);
    if (pushState) history.pushState(null, "", `/dashboard/${tab}`);
    $$(".tab-pane").forEach(p => p.classList.toggle("active", p.id === `pane-${tab}`));
    mod.activate();
}

function appendSidebarLink(list: HTMLElement, t: TabInfo): void {
    const link = document.createElement("a");
    link.className = t.id === "subscription" ? "dash-side-link dash-side-link-accent" : "dash-side-link";
    link.href = `/dashboard/${t.id}`;
    link.dataset["tab"] = t.id;
    const label = document.createElement("span");
    label.className = "dash-side-label";
    label.textContent = t.label;
    link.appendChild(label);
    link.addEventListener("click", (e) => {
        e.preventDefault();
        void activateTab(t.id);
    });
    list.appendChild(link);
}

function buildSidebarToggle(side: HTMLElement): HTMLElement {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dash-side-toggle";
    toggle.setAttribute("aria-controls", DASH_SIDE_LIST_ID);
    toggle.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "dash-side-toggle-label";
    toggle.appendChild(label);

    const chevron = document.createElement("span");
    chevron.className = "dash-side-toggle-chevron";
    chevron.setAttribute("aria-hidden", "true");
    toggle.appendChild(chevron);

    function onOutsideMouseDown(e: MouseEvent): void {
        if (side.contains(e.target as Node)) return;
        closeMenu(false);
    }

    function closeMenu(restoreFocus: boolean): void {
        if (!side.classList.contains("open")) return;
        side.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        closeDismissibleSurface(side);
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
        if (restoreFocus && toggle.offsetParent !== null) toggle.focus();
    }

    toggle.addEventListener("click", () => {
        if (side.classList.contains("open")) {
            closeMenu(false);
            return;
        }
        side.classList.add("open");
        toggle.setAttribute("aria-expanded", "true");
        openDismissibleSurface(side, () => closeMenu(true));
        document.addEventListener("mousedown", onOutsideMouseDown, true);
    });

    closeSidebarMenu = (restoreFocus = false) => closeMenu(restoreFocus);
    side.appendChild(toggle);
    return label;
}

const EVENTS_RECONNECT_MS = 5000;
const TAB_REFRESH_RETRY_MS = 5000;
let eventsSocket: WebSocket | null = null;
let refreshRetryTimer: number | null = null;

function connectDashboardEvents(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/events`);
    eventsSocket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ token: token() }));
    ws.onmessage = (e: MessageEvent) => {
        let msg: { type?: string };
        try {
            msg = JSON.parse(e.data as string) as { type?: string };
        } catch {
            return;
        }
        if (msg.type === "subscription") {
            window.dispatchEvent(new CustomEvent("subscription-changed"));
            void refreshTabs();
        }
    };
    ws.onclose = () => {
        if (eventsSocket !== ws) return;
        eventsSocket = null;
        window.setTimeout(connectDashboardEvents, EVENTS_RECONNECT_MS);
    };
}

async function refreshTabs(): Promise<void> {
    if (refreshRetryTimer !== null) {
        window.clearTimeout(refreshRetryTimer);
        refreshRetryTimer = null;
    }
    const revision = ++refreshRevision;
    let refreshed: MeInfo;
    try {
        refreshed = await authFetch<MeInfo>("/api/auth/me");
    } catch {
        if (revision === refreshRevision) {
            refreshRetryTimer = window.setTimeout(() => {
                refreshRetryTimer = null;
                void refreshTabs();
            }, TAB_REFRESH_RETRY_MS);
        }
        return;
    }
    if (revision !== refreshRevision) return;
    setMe(refreshed);
    const tabs = (refreshed.tabs ?? []).filter(t => TAB_LOADERS[t.id]);
    const nextStudioTabs = studioOnlyTabs(refreshed.tabs ?? []);
    if (navigationSnapshot(tabs, nextStudioTabs) === navigationSnapshot(allTabs, studioTabs)) return;
    const previousCurrentInfo = currentTab ? tabById.get(currentTab) : undefined;
    const currentPaneChanged = !!currentTab && tabs.some(tab => tab.id === currentTab && tab.pane !== previousCurrentInfo?.pane);
    const reloadTab = currentPaneChanged ? currentTab : null;
    activationSeq += 1;
    studioTabs = nextStudioTabs;
    allTabs = tabs;
    tabById.clear();
    for (const t of tabs) tabById.set(t.id, t);
    closeSidebarMenu?.(false);
    $("dash-side").replaceChildren();
    buildSidebar(tabs);
    if (currentTab && (!tabById.has(currentTab) || currentPaneChanged)) {
        const previous = currentTab;
        currentTab = null;
        loadedModules.get(previous)?.deactivate?.();
        if (currentPaneChanged) {
            loadedModules.delete(previous);
            document.getElementById(`pane-${previous}`)?.remove();
        }
        $$(".tab-pane").forEach(pane => pane.classList.remove("active"));
    }
    if (currentTab && tabById.has(currentTab)) {
        const active = currentTab;
        syncDashboardNavigation(active);
        if (sidebarToggleLabel) sidebarToggleLabel.textContent = tabById.get(active)!.label;
    } else if (reloadTab) {
        void activateTab(reloadTab, false);
    } else if (tabs[0]) {
        void activateTab(tabs[0].id);
    } else {
        if (sidebarToggleLabel) sidebarToggleLabel.textContent = "Dashboard";
        setNoTabsVisible(true);
    }
}

function buildSidebar(tabs: TabInfo[]): void {
    const side = $("dash-side");
    sidebarToggleLabel = buildSidebarToggle(side);

    const list = document.createElement("div");
    list.className = "dash-side-list";
    list.id = DASH_SIDE_LIST_ID;
    side.appendChild(list);

    const distinctGroups = new Set(tabs.map(t => t.group ?? "__none__"));
    const showHeaders = distinctGroups.size >= 2;

    const grouped: TabInfo[] = [];
    const ungrouped: TabInfo[] = [];
    for (const t of tabs) (t.group ? grouped : ungrouped).push(t);

    let lastGroup: string | undefined;
    for (const t of grouped) {
        if (showHeaders && t.group !== lastGroup) {
            const header = document.createElement("div");
            header.className = "dash-side-group";
            header.textContent = t.group!;
            list.appendChild(header);
            lastGroup = t.group;
        }
        appendSidebarLink(list, t);
    }
    for (const t of ungrouped) appendSidebarLink(list, t);

    if (studioTabs.length) {
        if (showHeaders) {
            const header = document.createElement("div");
            header.className = "dash-side-group";
            header.textContent = "In Studio";
            list.appendChild(header);
        }
        for (const t of studioTabs) list.appendChild(makeStudioTabLink(t));
    }
}

function makeStudioTabLink(t: TabInfo): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "dash-side-link studio";
    a.href = studioTabUrl(t.id);
    const label = document.createElement("span");
    label.className = "dash-side-label";
    label.textContent = t.label;
    const chip = document.createElement("span");
    chip.className = "dash-side-chip";
    chip.textContent = "Studio";
    chip.setAttribute("aria-hidden", "true");
    a.append(label, chip);
    return a;
}

function makeStudioLink(className: string): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = className;
    a.href = `${studioBaseUrl()}/dashboard`;
    a.textContent = "Open Studio";
    return a;
}

function makeBurgerTab(t: TabInfo, close: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    const current = t.id === currentTab;
    b.className = "site-account-item" + (current ? " active" : "");
    if (current) b.setAttribute("aria-current", "page");
    b.textContent = t.label;
    b.addEventListener("click", () => { close(); void activateTab(t.id); });
    return b;
}

function buildBurgerTabItems(close: () => void): HTMLElement[] {
    const distinctGroups = new Set(allTabs.map(t => t.group ?? "__none__"));
    if (distinctGroups.size < 2) {
        const items: HTMLElement[] = allTabs.map(t => makeBurgerTab(t, close));
        if (studioTabs.length) items.push(makeStudioLink("site-account-item"));
        return items;
    }

    const order: string[] = [];
    const byGroup = new Map<string, TabInfo[]>();
    for (const t of allTabs) {
        const g = t.group ?? "";
        if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
        byGroup.get(g)!.push(t);
    }

    const out: HTMLElement[] = [];
    for (const g of order) {
        const tabs = byGroup.get(g)!;
        if (g === "") { for (const t of tabs) out.push(makeBurgerTab(t, close)); continue; }

        const section = document.createElement("div");
        section.className = "site-burger-section";

        const header = document.createElement("button");
        header.type = "button";
        header.className = "site-burger-group";
        burgerGroupId += 1;
        header.id = `site-burger-group-${burgerGroupId}`;
        const label = document.createElement("span");
        label.textContent = g;
        const chevron = document.createElement("span");
        chevron.className = "site-burger-chevron";
        chevron.setAttribute("aria-hidden", "true");
        header.append(label, chevron);

        const list = document.createElement("div");
        list.className = "site-burger-group-list";
        list.id = `${header.id}-list`;
        list.setAttribute("role", "group");
        list.setAttribute("aria-labelledby", header.id);
        header.setAttribute("aria-controls", list.id);
        for (const t of tabs) list.appendChild(makeBurgerTab(t, close));

        const startsOpen = tabs.some(t => t.id === currentTab);
        section.classList.toggle("open", startsOpen);
        header.setAttribute("aria-expanded", String(startsOpen));
        header.addEventListener("click", () => {
            const wasOpen = section.classList.contains("open");
            section.parentElement?.querySelectorAll(".site-burger-section.open")
                .forEach(s => {
                    s.classList.remove("open");
                    s.querySelector<HTMLElement>(".site-burger-group")?.setAttribute("aria-expanded", "false");
                });
            if (!wasOpen) {
                section.classList.add("open");
                header.setAttribute("aria-expanded", "true");
            }
        });

        section.append(header, list);
        out.push(section);
    }
    if (studioTabs.length) out.push(makeStudioLink("site-account-item"));
    return out;
}

function showSessionProblem(state: "forbidden" | "unavailable"): void {
    const panel = document.createElement("section");
    panel.className = "card empty";
    panel.setAttribute("role", "alert");

    const title = document.createElement("h2");
    title.textContent = state === "forbidden" ? "Dashboard access denied" : "Dashboard unavailable";

    const message = document.createElement("p");
    message.textContent = state === "forbidden"
        ? "Your login is still active, but this account cannot open this dashboard."
        : "Your login has been kept. Check your connection and try again.";

    const actions = document.createElement("div");
    actions.className = "toolbar";
    actions.style.justifyContent = "center";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-primary";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => location.reload());

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "btn";
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", signOutAndRedirect);

    actions.append(retry, signOut);
    panel.append(title, message, actions);
    $("panes").replaceChildren(panel);
}

(async () => {
    const session = await loadDashboardSession();
    if (session.state === "signed-out") {
        loginRedirect();
        return;
    }
    if (session.state !== "ready") {
        void initSiteNav("dashboard");
        showSessionProblem(session.state);
        return;
    }
    const me = session.me;

    const baseDomain = location.hostname.replace(/^(live|admin|staff)\./, "");
    const isOnBareDomain = location.hostname === baseDomain;
    const isLiveHost = isOnBareDomain || location.hostname.startsWith("live.");
    const requestedTab = tabFromLocation();
    const tabPath = requestedTab ? `/${requestedTab}` : "";
    const port = location.port ? `:${location.port}` : "";
    if (me.kind === "user" && !isOnBareDomain) {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        location.replace(`https://${baseDomain}${port}/dashboard${tabPath}`);
        return;
    }
    if (me.kind === "admin" && isLiveHost) {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        location.replace(`https://staff.${baseDomain}${port}/dashboard${tabPath}`);
        return;
    }
    setMe(me);
    startSessionRenewal();
    reportVisit("dashboard");
    void initSiteNav("dashboard", [], {
        kind: me.kind,
        username: me.username,
        token: token(),
    });

    const tabs = (me.tabs ?? []).filter(t => TAB_LOADERS[t.id]);
    studioTabs = studioOnlyTabs(me.tabs ?? []);
    allTabs = tabs;
    for (const t of tabs) tabById.set(t.id, t);
    buildSidebar(tabs);
    document.body.classList.add("dash-page");
    setBurgerExtra((close) => buildBurgerTabItems(close));
    if (me.kind === "user") connectDashboardEvents();

    document.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-switch-tab]");
        if (a) { e.preventDefault(); void activateTab(a.dataset["switchTab"]!); }
    });
    window.addEventListener("popstate", () => {
        const tab = tabFromLocation();
        if (tab && tabById.has(tab)) void activateTab(tab, false);
    });

    $("dash-side").removeAttribute("hidden");

    const requested = tabFromLocation();
    const landing = requested && tabById.has(requested) ? requested : tabs[0]?.id;
    if (landing) {
        const search = landing === requested ? location.search : "";
        history.replaceState(null, "", `/dashboard/${landing}${search}`);
        void activateTab(landing, false);
    } else {
        setNoTabsVisible(true);
    }
})();
