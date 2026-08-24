import { maybeOpenTermsGate } from "./terms-gate.ts";
import type { TermsFlags } from "./dash/terms-status.ts";
import { API_BASE } from "./api.ts";
import { sessionTokenMetadata } from "./session-token.ts";
import { buildSignedIn, buildSignedOut, buildViewMenu } from "./nav/account-menu.ts";
import { buildBurger } from "./nav/burger.ts";
import { buildSocialLinks } from "./nav/social.ts";
import { wireDropdown } from "./nav/dropdown.ts";
import { renderStreak } from "./nav/streak-card.ts";
import { mountNotificationBell, startNotifications } from "./notifications/index.ts";
import { initStatusBanner } from "./status-banner.ts";
import { syncAccent } from "./theme.ts";

export type NavActive = "browse" | "dashboard" | null;

export interface SessionInfo {
    needsTerms?: boolean;
    needsBirthDate?: boolean;
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





function moreLinks(): Array<[string, string]> {
    return [
        ["Pricing", "/pricing"],
        ["Patron", "/patron"],
        ["Guides", "/guides"],
        ["API", "/docs"],
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
    const moreLabel = document.createElement("span");
    moreLabel.className = "site-more-label";
    moreLabel.textContent = "More";
    btn.appendChild(moreLabel);

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
    syncAccent();
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
    if (signedIn) void maybeOpenTermsGate(info as TermsFlags);
    if (signedIn && knownSession === undefined) storeSessionToken(info as SessionInfo, tokenBeforeRequest);
    if (knownSession === undefined) startSessionRenewal();
    if (signedIn) {
        mountNotificationBell(right);
        startNotifications();
    }
    right.appendChild(signedIn
        ? buildSignedIn(info as SessionInfo, controlButtons)
        : buildSignedOut());
    if (!signedIn) right.appendChild(buildViewMenu(controlButtons));
    right.appendChild(buildBurger(signedIn ? (info as SessionInfo) : null, pageControls));
}
