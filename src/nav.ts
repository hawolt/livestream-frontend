import { API_BASE } from "./api.ts";
import { sessionTokenMetadata } from "./session-token.ts";
import { buildSignedIn, buildSignedOut, buildViewMenu } from "./nav/account-menu.ts";
import { buildBurger } from "./nav/burger.ts";
import { wireDropdown } from "./nav/dropdown.ts";
import { initStatusBanner } from "./status-banner.ts";

export type NavActive = "browse" | "dashboard" | null;

export interface SessionInfo {
    kind?: string;
    username?: string;
    token?: string;
    streak?: number;
}

export { setBurgerExtra } from "./nav/burger.ts";

const SESSION_RENEWAL_CHECK_MS = 4 * 60 * 1000;
let sessionRenewalRequest: Promise<void> | null = null;
let sessionRenewalStarted = false;

function storeSessionToken(info: SessionInfo, tokenBeforeRequest: string): void {
    if (info.kind !== "user" || typeof info.token !== "string") return;
    const incoming = sessionTokenMetadata(info.token);
    if (!incoming) return;
    const currentToken = sessionStorage.getItem("dash_token") ?? "";
    const current = sessionTokenMetadata(currentToken);
    const changedDuringRequest = currentToken !== tokenBeforeRequest;
    if (changedDuringRequest &&
            (!current ||
             current.identity !== incoming.identity ||
             incoming.issuedAt <= current.issuedAt)) {
        return;
    }
    if (!changedDuringRequest &&
            current &&
            current.identity === incoming.identity &&
            incoming.issuedAt < current.issuedAt) {
        return;
    }
    sessionStorage.setItem("dash_token", info.token);
    sessionStorage.setItem("dash_kind", info.kind);
}

export async function signOut(token: string | undefined, trigger: HTMLButtonElement): Promise<void> {
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
        const current = !!active && el.dataset["nav"] === active;
        el.classList.toggle("active", current);
        if (current) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
    });
}

const MORE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;

const DISCORD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>`;

const GITHUB_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

const X_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

const SOCIAL_LINKS: Array<[string, string, string]> = [
    ["Discord", "https://discord.gg/BfWqPZvEDv", DISCORD_ICON],
    ["X", "https://x.com/itzonapp", X_ICON],
    ["GitHub", "https://github.com/hawolt/livestream-frontend", GITHUB_ICON],
];

function moreLinks(): Array<[string, string]> {
    return [
        ["API", "/wiki"],
        ["Status", `https://status.${location.hostname}`],
        ["Terms of Service", "/terms"],
        ["Privacy Policy", "/privacy"],
        ["Impressum", "/impressum"],
    ];
}

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

    for (const [label, href] of moreLinks()) {
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

const FLAME_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;

function renderStreak(streak: number | undefined): void {
    const existing = document.querySelector<HTMLElement>(".site-streak");
    if (typeof streak !== "number" || streak < 1) {
        existing?.remove();
        return;
    }
    if (existing) {
        const count = existing.querySelector("span");
        if (count) count.textContent = String(streak);
        existing.title = `${streak}-day visit streak`;
        return;
    }
    const more = document.querySelector<HTMLElement>(".site-more");
    if (!more) return;
    const chip = document.createElement("span");
    chip.className = "site-streak";
    chip.title = `${streak}-day visit streak`;
    chip.innerHTML = FLAME_ICON;
    const count = document.createElement("span");
    count.textContent = String(streak);
    chip.appendChild(count);
    more.after(chip);
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

async function renewSession(): Promise<void> {
    const tokenBeforeRequest = sessionStorage.getItem("dash_token") ?? "";
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (!res.ok) return;
        const info = await res.json() as SessionInfo;
        storeSessionToken(info, tokenBeforeRequest);
        if (info.kind === "user") renderStreak(info.streak);
    } catch {}
}

function renewSessionWhenVisible(): void {
    if (document.hidden || sessionRenewalRequest) return;
    sessionRenewalRequest = renewSession().finally(() => {
        sessionRenewalRequest = null;
    });
}

function startSessionRenewal(): void {
    if (sessionRenewalStarted) return;
    sessionRenewalStarted = true;
    window.setInterval(renewSessionWhenVisible, SESSION_RENEWAL_CHECK_MS);
    document.addEventListener("visibilitychange", renewSessionWhenVisible);
}

export async function initSiteNav(
    active: NavActive,
    pageControls: HTMLElement[] = [],
    knownSession?: SessionInfo | null,
): Promise<void> {
    markActive(active);
    insertMoreMenu();
    initStatusBanner();

    const right = rightMount();
    const controlButtons: HTMLButtonElement[] = [];
    for (const el of pageControls) {
        if (el instanceof HTMLButtonElement) controlButtons.push(el);
        else right.appendChild(el);
    }
    if (controlButtons.length) {
        const store = document.createElement("div");
        store.className = "site-control-store";
        store.hidden = true;
        for (const ctrl of controlButtons) store.appendChild(ctrl);
        right.appendChild(store);
    }

    for (const a of buildSocialLinks()) right.appendChild(a);

    let info = knownSession ?? null;
    const tokenBeforeRequest = sessionStorage.getItem("dash_token") ?? "";
    if (knownSession === undefined) {
        try {
            const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
            if (res.ok) info = await res.json();
        } catch {}
    }

    const signedIn = !!info && info.kind === "user" && typeof info.username === "string";
    if (signedIn) renderStreak((info as SessionInfo).streak);
    if (signedIn && knownSession === undefined) storeSessionToken(info as SessionInfo, tokenBeforeRequest);
    if (knownSession === undefined) startSessionRenewal();
    right.appendChild(signedIn
        ? buildSignedIn(info as SessionInfo, controlButtons)
        : buildSignedOut());
    if (!signedIn && controlButtons.length) right.appendChild(buildViewMenu(controlButtons));
    right.appendChild(buildBurger(signedIn ? (info as SessionInfo) : null, pageControls));
}
