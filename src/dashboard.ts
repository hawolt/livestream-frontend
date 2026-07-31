import { initSiteNav, setBurgerExtra } from "./nav.ts";
import { $, $$ } from "./dash/dom.ts";
import "./dash/modal.ts";
import {
    setMe, token, loginRedirect, signOutAndRedirect, loadDashboardSession, startSessionRenewal,
    type TabInfo, type TabModule,
} from "./dash/session.ts";

const TAB_LOADERS: Record<string, () => Promise<TabModule>> = {
    stream:           () => import("./dash/tabs/stream.ts"),
    discord:          () => import("./dash/tabs/discord.ts"),
    "stream-manager": () => import("./dash/tabs/stream-manager.ts"),
    chatbox:          () => import("./dash/tabs/chatbox.ts"),
    alertbox:         () => import("./dash/tabs/alertbox.ts"),
    "stream-health":  () => import("./dash/tabs/stream-health.ts"),
    "stream-summary": () => import("./dash/tabs/stream-summary.ts"),
    activity:         () => import("./dash/tabs/activity.ts"),
    settings:         () => import("./dash/tabs/settings.ts"),
    subscription:     () => import("./dash/tabs/subscription.ts"),
};

const tabById = new Map<string, TabInfo>();
const loadedModules = new Map<string, TabModule>();
let allTabs: TabInfo[] = [];
let currentTab: string | null = null;
let activationSeq = 0;
let sidebarToggleLabel: HTMLElement | null = null;
let closeSidebarMenu: (() => void) | null = null;
let studioUrl: string | null = null;

function tabFromLocation(): string | null {
    const m = location.pathname.match(/^\/dashboard(?:\.html)?\/([A-Za-z0-9_-]+)\/?$/);
    if (m) return m[1]!;
    const hash = location.hash.slice(1);
    return hash || null;
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

    $$(".dash-side-link[data-tab]").forEach(b => b.classList.toggle("active", b.dataset["tab"] === tab));
    const btn = document.querySelector<HTMLElement>(`.dash-side-link[data-tab="${tab}"]`);
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    if (sidebarToggleLabel) sidebarToggleLabel.textContent = info.label;
    closeSidebarMenu?.();
    if (pushState) history.pushState(null, "", `/dashboard/${tab}`);
    $$(".tab-pane").forEach(p => p.classList.toggle("active", p.id === `pane-${tab}`));
    mod.activate();
}

function appendSidebarLink(list: HTMLElement, t: TabInfo): void {
    const link = document.createElement("a");
    link.className = "dash-side-link";
    link.href = `/dashboard/${t.id}`;
    link.dataset["tab"] = t.id;
    link.textContent = t.label;
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
    toggle.setAttribute("aria-haspopup", "true");
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
        closeMenu();
    }

    function closeMenu(): void {
        side.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
    }

    toggle.addEventListener("click", () => {
        const open = side.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
        if (open) document.addEventListener("mousedown", onOutsideMouseDown, true);
        else document.removeEventListener("mousedown", onOutsideMouseDown, true);
    });

    closeSidebarMenu = closeMenu;
    side.appendChild(toggle);
    return label;
}

function buildSidebar(tabs: TabInfo[]): void {
    const side = $("dash-side");
    sidebarToggleLabel = buildSidebarToggle(side);

    const list = document.createElement("div");
    list.className = "dash-side-list";
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

    if (studioUrl) {
        if (showHeaders) {
            const header = document.createElement("div");
            header.className = "dash-side-group";
            header.textContent = "Studio";
            list.appendChild(header);
        }
        list.appendChild(makeStudioLink("dash-side-link"));
    }
}

function makeStudioLink(className: string): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = className;
    a.href = studioUrl ?? "";
    a.textContent = "Open Studio";
    return a;
}

function makeBurgerTab(t: TabInfo, close: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "site-account-item" + (t.id === currentTab ? " active" : "");
    b.textContent = t.label;
    b.addEventListener("click", () => { close(); void activateTab(t.id); });
    return b;
}

function buildBurgerTabItems(close: () => void): HTMLElement[] {
    const distinctGroups = new Set(allTabs.map(t => t.group ?? "__none__"));
    if (distinctGroups.size < 2) {
        const items: HTMLElement[] = allTabs.map(t => makeBurgerTab(t, close));
        if (studioUrl) items.push(makeStudioLink("site-account-item"));
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
        const label = document.createElement("span");
        label.textContent = g;
        const chevron = document.createElement("span");
        chevron.className = "site-burger-chevron";
        chevron.setAttribute("aria-hidden", "true");
        header.append(label, chevron);

        const list = document.createElement("div");
        list.className = "site-burger-group-list";
        for (const t of tabs) list.appendChild(makeBurgerTab(t, close));

        if (tabs.some(t => t.id === currentTab)) section.classList.add("open");
        header.addEventListener("click", () => {
            const wasOpen = section.classList.contains("open");
            section.parentElement?.querySelectorAll(".site-burger-section.open")
                .forEach(s => s.classList.remove("open"));
            if (!wasOpen) section.classList.add("open");
        });

        section.append(header, list);
        out.push(section);
    }
    if (studioUrl) out.push(makeStudioLink("site-account-item"));
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

    const isLiveHost = location.hostname.startsWith("live.");
    const baseDomain = location.hostname.replace(/^(live|admin)\./, "");
    const requestedTab = tabFromLocation();
    const tabPath = requestedTab ? `/${requestedTab}` : "";
    const port = location.port ? `:${location.port}` : "";
    if (me.kind === "user" && !isLiveHost) {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        location.replace(`https://live.${baseDomain}${port}/dashboard${tabPath}`);
        return;
    }
    if (me.kind === "admin" && isLiveHost) {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        location.replace(`https://admin.${baseDomain}${port}/dashboard${tabPath}`);
        return;
    }
    setMe(me);
    startSessionRenewal();
    void initSiteNav("dashboard", [], {
        kind: me.kind,
        username: me.username,
        token: token(),
    });

    const tabs = (me.tabs ?? []).filter(t => TAB_LOADERS[t.id]);
    const studioTabs = (me.tabs ?? []).filter(t => !TAB_LOADERS[t.id]);
    studioUrl = studioTabs.length ? `https://studio.${baseDomain}${port}/dashboard` : null;
    allTabs = tabs;
    for (const t of tabs) tabById.set(t.id, t);
    buildSidebar(tabs);
    document.body.classList.add("dash-page");
    setBurgerExtra((close) => buildBurgerTabItems(close));

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
        history.replaceState(null, "", `/dashboard/${landing}`);
        void activateTab(landing, false);
    }
})();
