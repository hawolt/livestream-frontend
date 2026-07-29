import { apiFetch, API_BASE, type RegionOption } from "../api.ts";
import { sessionResponseIdentity, sessionTokenMetadata } from "../session-token.ts";

export interface TabInfo { id: string; label: string; pane: string; group?: string; }

export interface MeInfo {
    id: number;
    kind: string;
    flags: string;
    emailVerified: boolean;
    username?: string;
    tenantId?: number;
    tenantName?: string | null;
    tabs: TabInfo[];
}

export interface TabModule {
    init(pane: HTMLElement): void;
    activate(): void;
    deactivate?(): void;
}

let TOKEN: string = sessionStorage.getItem("dash_token") ?? "";
let me: MeInfo | null = null;
let tokenRevision = 0;

export const token = (): string => TOKEN;

type TokenAdoption = "accepted" | "older" | "mismatch" | "invalid";

function adoptSessionToken(t: string, allowIdentityChange: boolean): TokenAdoption {
    const incoming = sessionTokenMetadata(t);
    if (!incoming) return "invalid";
    const current = sessionTokenMetadata(TOKEN);
    if (current && current.identity !== incoming.identity && !allowIdentityChange) {
        sessionStorage.setItem("dash_token", TOKEN);
        return "mismatch";
    }
    if (current && current.identity === incoming.identity && incoming.issuedAt < current.issuedAt) {
        sessionStorage.setItem("dash_token", TOKEN);
        return "older";
    }
    if (t !== TOKEN) tokenRevision++;
    TOKEN = t;
    sessionStorage.setItem("dash_token", t);
    return "accepted";
}

export function setToken(t: string): void {
    adoptSessionToken(t, false);
}
export const getMe = (): MeInfo | null => me;
export function setMe(m: MeInfo): void { me = m; }

function clearLocalSession(): void {
    tokenRevision++;
    TOKEN = "";
    me = null;
    sessionStorage.removeItem("dash_token");
    sessionStorage.removeItem("dash_kind");
}

export function loginRedirect(): void {
    clearLocalSession();
    location.replace("/login");
}

export function signOutAndRedirect(): void {
    const headers = TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : undefined;
    fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers,
        credentials: "include",
        keepalive: true,
    }).catch(() => {});
    clearLocalSession();
    location.replace("/login");
}

type SessionBootstrap = "authenticated" | "unauthenticated" | "unavailable" | "mismatch";
let sessionBootstrap: Promise<SessionBootstrap> | null = null;
const SESSION_RENEWAL_CHECK_MS = 4 * 60 * 1000;
let sessionRenewalStarted = false;

async function requestSessionFromCookie(): Promise<SessionBootstrap> {
    const requestRevision = tokenRevision;
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (res.status === 401) return "unauthenticated";
        if (!res.ok) return "unavailable";
        const data = await res.json() as { token?: string; kind?: string; id?: number; tenantId?: number };
        if (!data.token || !data.kind || typeof data.id !== "number") return "unavailable";
        const meIdentity = me ? sessionResponseIdentity(me) : "";
        if (meIdentity && sessionResponseIdentity(data) !== meIdentity) {
            return "mismatch";
        }
        const incoming = sessionTokenMetadata(data.token);
        if (!incoming) return "unavailable";
        if (requestRevision !== tokenRevision) {
            const current = sessionTokenMetadata(TOKEN);
            if (!current) return "mismatch";
            if (current.identity !== incoming.identity || incoming.issuedAt <= current.issuedAt) {
                sessionStorage.setItem("dash_token", TOKEN);
                return "authenticated";
            }
        }
        const adoption = adoptSessionToken(data.token, true);
        if (adoption === "invalid") return "unavailable";
        sessionStorage.setItem("dash_kind", data.kind);
        return "authenticated";
    } catch {
        return "unavailable";
    }
}

function bootstrapSessionFromCookie(): Promise<SessionBootstrap> {
    if (!sessionBootstrap) {
        sessionBootstrap = requestSessionFromCookie().finally(() => {
            sessionBootstrap = null;
        });
    }
    return sessionBootstrap;
}

async function renewSessionWhenVisible(): Promise<void> {
    if (document.hidden) return;
    const bootstrap = await bootstrapSessionFromCookie();
    if (bootstrap === "mismatch") {
        loginRedirect();
        return;
    }
    if (bootstrap !== "unauthenticated") return;
    // The renewal cookie lapsed, but the bearer token we're still holding may
    // well be valid (it has its own lifetime and authFetch() keeps working off
    // it independently of this cookie). Only force a logout once the bearer
    // token itself is confirmed dead too - otherwise this background timer
    // would cause the very "unexpected session loss" issue #37 fixed.
    if (!TOKEN) {
        loginRedirect();
        return;
    }
    const res = await fetchMe();
    if (res?.status === 401) loginRedirect();
}

export function startSessionRenewal(): void {
    if (sessionRenewalStarted) return;
    sessionRenewalStarted = true;
    window.setInterval(renewSessionWhenVisible, SESSION_RENEWAL_CHECK_MS);
    document.addEventListener("visibilitychange", renewSessionWhenVisible);
}

window.addEventListener("storage", event => {
    if (event.storageArea !== sessionStorage || event.key !== "dash_token") return;
    if (!event.newValue) {
        loginRedirect();
        return;
    }
    const current = sessionTokenMetadata(TOKEN);
    const incoming = sessionTokenMetadata(event.newValue);
    const expectedIdentity = me ? sessionResponseIdentity(me) : current?.identity ?? "";
    if (!incoming || (expectedIdentity && incoming.identity !== expectedIdentity)) {
        loginRedirect();
        return;
    }
    const adoption = adoptSessionToken(event.newValue, false);
    if (adoption === "invalid" || adoption === "mismatch") loginRedirect();
});

type DashboardSession =
    | { state: "ready"; me: MeInfo }
    | { state: "signed-out" | "forbidden" | "unavailable" };

async function fetchMe(): Promise<Response | null> {
    return fetch(`${API_BASE}/auth/me`, {
        headers: { "Authorization": `Bearer ${TOKEN}` },
        credentials: "include",
    }).catch(() => null);
}

async function dashboardResult(res: Response | null): Promise<DashboardSession> {
    if (!res) return { state: "unavailable" };
    if (res.status === 401) return { state: "signed-out" };
    if (res.status === 403) return { state: "forbidden" };
    if (!res.ok) return { state: "unavailable" };
    try {
        const data = await res.json() as MeInfo & { token?: string };
        if (data.token) setToken(data.token);
        return { state: "ready", me: data };
    } catch {
        return { state: "unavailable" };
    }
}

export async function loadDashboardSession(): Promise<DashboardSession> {
    const hadToken = TOKEN !== "";
    const bootstrap = await bootstrapSessionFromCookie();
    if (bootstrap === "mismatch") return { state: "signed-out" };
    if (bootstrap === "authenticated") return dashboardResult(await fetchMe());
    if (bootstrap === "unavailable") return { state: "unavailable" };
    if (!hadToken) return { state: "signed-out" };
    return dashboardResult(await fetchMe());
}

export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const request = () => apiFetch<T>(path, {
        ...init,
        headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${TOKEN}`,
            ...(init?.headers as Record<string, string> ?? {}),
        },
    });
    try {
        return await request();
    } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 401) throw e;
        const bootstrap = await bootstrapSessionFromCookie();
        if (bootstrap === "unauthenticated" || bootstrap === "mismatch") {
            loginRedirect();
            throw e;
        }
        if (bootstrap === "unavailable") throw e;
        try {
            return await request();
        } catch (retryError) {
            if ((retryError as { status?: number }).status === 401) loginRedirect();
            throw retryError;
        }
    }
}

let regionsCache: RegionOption[] | null = null;

export async function loadRegions(): Promise<RegionOption[]> {
    if (regionsCache) return regionsCache;
    try {
        const res = await authFetch<{ regions: RegionOption[] }>("/api/regions");
        regionsCache = Array.isArray(res.regions) ? res.regions : [];
    } catch {
        return [];
    }
    return regionsCache;
}

export const $  = (id: string) => document.getElementById(id) as HTMLElement;
export const $$ = (sel: string) => document.querySelectorAll<HTMLElement>(sel);

export const fmtDate = (s: string | null | undefined): string => {
    if (!s) return "-";
    const raw = s.slice(0, 10);
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
};
export const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/`/g,"&#96;");

export function fmtUptime(s: number): string {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

let modalReturnFocus: HTMLElement | null = null;

function modalFocusables(): HTMLElement[] {
    return Array.from($("modal").querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter(el => el.offsetParent !== null);
}

function onModalKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
    }
    if (e.key !== "Tab") return;
    const focusables = modalFocusables();
    if (!focusables.length) {
        e.preventDefault();
        $("modal-box").focus();
        return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (!$("modal").contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

export function openModal(title: string, body: string, footer = ""): void {
    const modal = $("modal");
    if (!modal.classList.contains("open")) {
        modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    $("modal-title").textContent = title;
    $("modal-body").innerHTML    = body;
    $("modal-foot").innerHTML    = footer;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.removeEventListener("keydown", onModalKeyDown);
    document.addEventListener("keydown", onModalKeyDown);
    requestAnimationFrame(() => {
        if (!modal.classList.contains("open")) return;
        const initial = $("modal-body").querySelector<HTMLElement>(
            "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]",
        );
        (initial ?? modalFocusables()[0] ?? $("modal-box")).focus();
    });
}
export function closeModal(): void {
    const modal = $("modal");
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onModalKeyDown);
    const returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
}
$("modal-close").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
(window as unknown as Record<string,unknown>)["closeModal"] = closeModal;

export function maskSecret(value: string): string {
    return value ? "•".repeat(16) : "";
}

export function wireCopyButtons(values: string[]): void {
    document.querySelectorAll<HTMLButtonElement>("#modal-body [data-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
            const value = values[Number(btn.dataset["copy"] ?? "-1")] ?? "";
            navigator.clipboard.writeText(value).then(() => {
                btn.textContent = "Copied";
                setTimeout(() => { btn.textContent = "Copy"; }, 1200);
            }).catch(() => { btn.textContent = "Failed"; });
        });
    });
}

export function wireRevealButtons(values: string[]): void {
    document.querySelectorAll<HTMLButtonElement>("#modal-body [data-reveal]").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = Number(btn.dataset["reveal"] ?? "-1");
            const code = document.querySelector<HTMLElement>(`#modal-body [data-secret="${idx}"]`);
            if (!code) return;
            const hidden = btn.textContent === "Reveal";
            code.textContent = hidden ? (values[idx] ?? "") : maskSecret(values[idx] ?? "");
            btn.textContent = hidden ? "Hide" : "Reveal";
        });
    });
}
