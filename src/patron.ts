import { API_BASE, apiFetch } from "./api.ts";
import { initSiteNav, type SessionInfo } from "./nav.ts";
import { minorToAmountText } from "./patron/view.ts";

interface PatronLeaderboardEntry {
    username: string;
    total: number;
}

interface PatronLeaderboard {
    enabled: boolean;
    label: string;
    badge: string;
    currency: string;
    entries: PatronLeaderboardEntry[];
}

interface PatronMe {
    enabled: boolean;
    label: string;
    badge: string;
    currency: string;
    total: number;
}

const statusEl = document.getElementById("patron-status") as HTMLElement;
const leaderboardEl = document.getElementById("patron-leaderboard") as HTMLElement;
const meEl = document.getElementById("patron-me") as HTMLElement;
const ctaEl = document.getElementById("patron-cta") as HTMLElement;
const badgeImgEl = document.getElementById("patron-badge-img") as HTMLImageElement;

let sessionToken: string | null = null;
let signedIn = false;

function element(tag: string, className?: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function redirectToLogin(): void {
    location.href = `/login?return=${encodeURIComponent(location.href)}`;
}

async function loadSession(): Promise<SessionInfo | null> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (!res.ok) return null;
        return await res.json() as SessionInfo;
    } catch {
        return null;
    }
}

function renderLeaderboard(board: PatronLeaderboard): void {
    if (badgeImgEl) badgeImgEl.src = `/static/img/badge-${board.badge}.svg`;
    if (!board.enabled) {
        statusEl.textContent = "Patron donations are not available right now.";
        ctaEl.hidden = true;
        leaderboardEl.hidden = true;
        return;
    }
    statusEl.hidden = true;
    ctaEl.hidden = false;
    if (!board.entries.length) {
        leaderboardEl.replaceChildren(element("p", "patron-empty", "No patrons yet. Be the first."));
        return;
    }
    const list = element("ol", "patron-list");
    board.entries.forEach((entry, index) => {
        const row = element("li", "patron-row");
        row.append(element("span", "patron-rank", String(index + 1)));
        row.append(element("span", "patron-name", entry.username));
        row.append(element("span", "patron-amount", minorToAmountText(entry.total, board.currency)));
        list.append(row);
    });
    leaderboardEl.replaceChildren(list);
}

async function loadLeaderboard(): Promise<void> {
    try {
        const res = await fetch("/api/live/billing/patron-leaderboard");
        if (!res.ok) throw new Error("leaderboard unavailable");
        renderLeaderboard(await res.json() as PatronLeaderboard);
    } catch {
        statusEl.textContent = "Could not load the leaderboard right now. Try refreshing the page.";
    }
}

async function loadMe(): Promise<void> {
    if (!signedIn || !sessionToken) return;
    try {
        const me = await apiFetch<PatronMe>("/api/billing/patron", {
            headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (me.enabled && me.total > 0) {
            meEl.hidden = false;
            meEl.textContent = `You have donated ${minorToAmountText(me.total, me.currency)} in total. Thank you.`;
        }
    } catch {
        meEl.hidden = true;
    }
}

async function donate(button: HTMLButtonElement): Promise<void> {
    if (!signedIn || !sessionToken) {
        redirectToLogin();
        return;
    }
    button.disabled = true;
    try {
        const res = await apiFetch<{ url?: string }>("/api/billing/patron/checkout", {
            method: "POST",
            headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (!res.url) throw new Error("The server did not return a payment link.");
        location.href = res.url;
    } catch (e) {
        button.disabled = false;
        alert("Could not start checkout: " + (e instanceof Error ? e.message : String(e)));
    }
}

async function boot(): Promise<void> {
    const session = await loadSession();
    signedIn = !!session && session.kind === "user" && typeof session.username === "string";
    sessionToken = signedIn && typeof session?.token === "string" ? session.token : null;
    void initSiteNav(null, [], session);

    const button = document.getElementById("patron-donate") as HTMLButtonElement | null;
    button?.addEventListener("click", () => void donate(button));
    if (button) button.textContent = signedIn ? "Donate" : "Sign in to donate";

    await loadLeaderboard();
    void loadMe();
}

void boot();
