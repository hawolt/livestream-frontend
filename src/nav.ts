import { API_BASE } from "./api.ts";

export type NavActive = "browse" | "dashboard" | null;

interface SessionInfo {
    kind?: string;
    username?: string;
    token?: string;
}

const GEAR_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

const MORE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;

const MENU_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`;

const DISCORD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>`;

const GITHUB_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

const SOCIAL_LINKS: Array<[string, string, string]> = [
    ["Discord", "https://discord.gg/BfWqPZvEDv", DISCORD_ICON],
    ["GitHub", "https://github.com/hawolt/livestream-frontend", GITHUB_ICON],
];

function wireDropdown(wrap: HTMLElement, btn: HTMLButtonElement, panel: HTMLElement, onOpen?: () => void): () => void {
    function closePanel(): void {
        panel.hidden = true;
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
    }

    function onOutsideMouseDown(e: MouseEvent): void {
        if (wrap.contains(e.target as Node)) return;
        closePanel();
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") closePanel();
    }

    btn.addEventListener("click", () => {
        if (panel.hidden) {
            onOpen?.();
            panel.hidden = false;
            document.addEventListener("mousedown", onOutsideMouseDown, true);
            document.addEventListener("keydown", onKeyDown, true);
        } else {
            closePanel();
        }
    });
    return closePanel;
}

let burgerExtraProvider: ((close: () => void) => HTMLElement[]) | null = null;
export function setBurgerExtra(provider: ((close: () => void) => HTMLElement[]) | null): void {
    burgerExtraProvider = provider;
}

async function signOut(token: string | undefined, trigger: HTMLButtonElement): Promise<void> {
    const originalLabel = trigger.textContent ?? "Sign out";
    trigger.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token ?? ""}` },
            credentials: "include",
        });
        if (!res.ok) throw new Error("logout failed");
    } catch {
        trigger.disabled = false;
        trigger.textContent = "Sign out failed";
        window.setTimeout(() => {
            if (trigger.textContent === "Sign out failed") trigger.textContent = originalLabel;
        }, 2000);
        return;
    }
    sessionStorage.removeItem("dash_token");
    sessionStorage.removeItem("dash_kind");
    location.reload();
}

function rightMount(): HTMLElement {
    return document.getElementById("site-nav-right") as HTMLElement;
}

export function markActive(active: NavActive): void {
    document.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
        el.classList.toggle("active", !!active && el.dataset["nav"] === active);
    });
}

function buildSignedOut(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-auth-cluster";

    const login = document.createElement("a");
    login.className = "btn btn-sm btn-fill-hover";
    login.href = `/login?return=${encodeURIComponent(location.href)}`;
    login.textContent = "Login";

    const register = document.createElement("a");
    register.className = "btn btn-sm btn-fill-hover";
    register.href = `/register?return=${encodeURIComponent(location.href)}`;
    register.textContent = "Sign up";

    wrap.append(login, register);
    return wrap;
}

function buildSignedIn(info: SessionInfo): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-account";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-account-btn";
    btn.setAttribute("aria-label", "Account menu");
    btn.title = "Account";
    btn.innerHTML = GEAR_ICON;

    const panel = document.createElement("div");
    panel.className = "site-account-panel";
    panel.hidden = true;

    const nameRow = document.createElement("div");
    nameRow.className = "site-account-name";
    nameRow.textContent = info.username ?? "";

    const dashLink = document.createElement("a");
    dashLink.className = "site-account-item";
    dashLink.href = "/dashboard";
    dashLink.textContent = "Dashboard";

    const signOutBtn = document.createElement("button");
    signOutBtn.type = "button";
    signOutBtn.className = "site-account-item site-account-item-btn";
    signOutBtn.textContent = "Sign out";

    panel.append(nameRow, dashLink, signOutBtn);
    wrap.append(btn, panel);
    wireDropdown(wrap, btn, panel);
    signOutBtn.addEventListener("click", () => void signOut(info.token, signOutBtn));
    return wrap;
}

const MORE_LINKS: Array<[string, string]> = [
    ["API", "/wiki"],
    ["Terms of Service", "/terms"],
    ["Privacy Policy", "/privacy"],
];

function buildMoreMenu(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-more";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-more-btn";
    btn.setAttribute("aria-label", "More");
    btn.title = "More";
    btn.innerHTML = MORE_ICON;

    const panel = document.createElement("div");
    panel.className = "site-more-panel";
    panel.hidden = true;

    for (const [label, href] of MORE_LINKS) {
        const a = document.createElement("a");
        a.className = "site-account-item";
        a.href = href;
        a.textContent = label;
        panel.appendChild(a);
    }

    wrap.append(btn, panel);
    wireDropdown(wrap, btn, panel);
    return wrap;
}

function buildBurger(info: SessionInfo | null, pageControls: HTMLElement[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-burger";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-burger-btn";
    btn.setAttribute("aria-label", "Menu");
    btn.title = "Menu";
    btn.innerHTML = MENU_ICON;

    const panel = document.createElement("div");
    panel.className = "site-burger-panel";
    panel.hidden = true;

    function sep(): HTMLElement {
        const el = document.createElement("div");
        el.className = "site-burger-sep";
        return el;
    }

    function link(label: string, href: string): HTMLAnchorElement {
        const a = document.createElement("a");
        a.className = "site-account-item";
        a.href = href;
        a.textContent = label;
        return a;
    }

    let burgerClose: () => void = () => { panel.hidden = true; };

    function rebuild(): void {
        panel.replaceChildren();

        if (burgerExtraProvider) {
            const extra = burgerExtraProvider(burgerClose);
            for (const el of extra) panel.appendChild(el);
            if (extra.length) panel.appendChild(sep());
        }

        let hasControls = false;
        for (const ctrl of pageControls) {
            if (!(ctrl instanceof HTMLButtonElement)) continue;
            if (getComputedStyle(ctrl).display === "none") continue;
            const item = document.createElement("button");
            item.type = "button";
            item.className = "site-account-item";
            item.textContent = ctrl.title || ctrl.textContent || "";
            item.addEventListener("click", () => {
                ctrl.click();
                rebuild();
            });
            panel.appendChild(item);
            hasControls = true;
        }
        if (hasControls) panel.appendChild(sep());

        if (info) {
            const nameRow = document.createElement("div");
            nameRow.className = "site-account-name";
            nameRow.textContent = info.username ?? "";
            panel.appendChild(nameRow);
            panel.appendChild(link("Dashboard", "/dashboard"));
            const out = document.createElement("button");
            out.type = "button";
            out.className = "site-account-item";
            out.textContent = "Sign out";
            out.addEventListener("click", () => void signOut(info.token, out));
            panel.appendChild(out);
        } else {
            panel.appendChild(link("Login", `/login?return=${encodeURIComponent(location.href)}`));
            panel.appendChild(link("Sign up", `/register?return=${encodeURIComponent(location.href)}`));
        }
    }

    wrap.append(btn, panel);
    burgerClose = wireDropdown(wrap, btn, panel, rebuild);
    return wrap;
}

function insertMoreMenu(): void {
    const links = document.querySelector<HTMLElement>(".site-links");
    if (!links) return;
    const browseLink = links.querySelector<HTMLElement>('[data-nav="browse"]');
    const moreMenu = buildMoreMenu();
    if (browseLink) {
        browseLink.after(moreMenu);
    } else {
        links.appendChild(moreMenu);
    }
}

function buildSocialLinks(): HTMLElement[] {
    return SOCIAL_LINKS.map(([label, href, icon]) => {
        const a = document.createElement("a");
        a.className = "site-social-btn";
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", label);
        a.title = label;
        a.innerHTML = icon;
        return a;
    });
}

export async function initSiteNav(active: NavActive, pageControls: HTMLElement[] = []): Promise<void> {
    markActive(active);
    insertMoreMenu();

    const right = rightMount();
    let controlsWrap: HTMLElement | null = null;
    for (const el of pageControls) {
        if (el instanceof HTMLButtonElement) {
            if (!controlsWrap) {
                controlsWrap = document.createElement("div");
                controlsWrap.className = "site-nav-controls";
                right.appendChild(controlsWrap);
            }
            controlsWrap.appendChild(el);
        } else {
            right.appendChild(el);
        }
    }

    for (const a of buildSocialLinks()) right.appendChild(a);

    let info: SessionInfo | null = null;
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (res.ok) info = await res.json();
    } catch {}

    const signedIn = !!info && info.kind === "user" && typeof info.username === "string";
    right.appendChild(signedIn ? buildSignedIn(info as SessionInfo) : buildSignedOut());
    right.appendChild(buildBurger(signedIn ? (info as SessionInfo) : null, pageControls));
}
