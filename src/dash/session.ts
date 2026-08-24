import { apiFetch, readJsonBody, API_BASE } from "../api.ts";
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
    birthYear?: number | null;
    termsVersion?: number;
    needsTerms?: boolean;
    needsBirthYear?: boolean;
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

export type SessionBootstrap = "authenticated" | "unauthenticated" | "unavailable" | "mismatch";

export type AuthRecoveryAction = "redirect" | "retry" | "give-up";

export function decideAuthRecovery(bootstrap: SessionBootstrap): AuthRecoveryAction {
    if (bootstrap === "unauthenticated" || bootstrap === "mismatch") return "redirect";
    if (bootstrap === "unavailable") return "give-up";
    return "retry";
}

export type DashboardStatusOutcome = "unavailable" | "signed-out" | "forbidden" | "continue";

export function decideDashboardStatus(res: { status: number; ok: boolean } | null): DashboardStatusOutcome {
    if (!res) return "unavailable";
    if (res.status === 401) return "signed-out";
    if (res.status === 403) return "forbidden";
    if (!res.ok) return "unavailable";
    return "continue";
}

let sessionBootstrap: Promise<SessionBootstrap> | null = null;
const SESSION_RENEWAL_CHECK_MS = 4 * 60 * 1000;
let sessionRenewalStarted = false;

async function requestSessionFromCookie(): Promise<SessionBootstrap> {
    const requestRevision = tokenRevision;
    let res: Response;
    try {
        res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
    } catch {
        return "unavailable";
    }
    if (res.status === 401) return "unauthenticated";
    if (!res.ok) return "unavailable";
    let data: { token?: string; kind?: string; id?: number; tenantId?: number } | undefined;
    try {
        data = await readJsonBody<{ token?: string; kind?: string; id?: number; tenantId?: number }>(res);
    } catch {
        return "unavailable";
    }
    if (!data || !data.token || !data.kind || typeof data.id !== "number") return "unavailable";
    const meIdentity = me ? sessionResponseIdentity(me) : "";
    if (meIdentity && sessionResponseIdentity(data) !== meIdentity) {
        return "mismatch";
    }
    const incoming = sessionTokenMetadata(data.token);
    if (!incoming) return "unavailable";
    try {
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
    const outcome = decideDashboardStatus(res);
    if (outcome !== "continue") return { state: outcome };
    let data: (MeInfo & { token?: string }) | undefined;
    try {
        data = await readJsonBody<MeInfo & { token?: string }>(res!);
    } catch {
        return { state: "unavailable" };
    }
    if (!data) return { state: "unavailable" };
    try {
        if (data.token) setToken(data.token);
    } catch {
        return { state: "unavailable" };
    }
    return { state: "ready", me: data };
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
        const action = decideAuthRecovery(bootstrap);
        if (action === "redirect") {
            loginRedirect();
            throw e;
        }
        if (action === "give-up") throw e;
        try {
            return await request();
        } catch (retryError) {
            if ((retryError as { status?: number }).status === 401) loginRedirect();
            throw retryError;
        }
    }
}
