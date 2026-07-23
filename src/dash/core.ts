import { apiFetch, API_BASE, type RegionOption } from "../api.ts";

export interface TabInfo { id: string; label: string; pane: string; group?: string; }

export interface MeInfo {
    kind: string;
    flags: string;
    emailVerified: boolean;
    username?: string;
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

export const token = (): string => TOKEN;
export function setToken(t: string): void {
    TOKEN = t;
    sessionStorage.setItem("dash_token", t);
}
export const getMe = (): MeInfo | null => me;
export function setMe(m: MeInfo): void { me = m; }

export function logoutRedirect(): void {
    if (TOKEN) {
        fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${TOKEN}` },
            keepalive: true,
        }).catch(() => {});
    }
    sessionStorage.removeItem("dash_token");
    sessionStorage.removeItem("dash_kind");
    location.replace("/login");
}

export async function bootstrapSessionFromCookie(): Promise<boolean> {
    const res = await fetch(`${API_BASE}/auth/session`).catch(() => null);
    if (!res || !res.ok) return false;
    const data = await res.json() as { token: string; kind: string };
    setToken(data.token);
    sessionStorage.setItem("dash_kind", data.kind);
    return true;
}

export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${TOKEN}`,
        ...(init?.headers as Record<string, string> ?? {}),
    };
    try {
        return await apiFetch<T>(path, { ...init, headers });
    } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 401 || status === 403) {
            logoutRedirect();
        }
        throw e;
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

let modalCleanup: (() => void) | null = null;

export function openModal(title: string, body: string, footer = ""): void {
    $("modal-title").textContent = title;
    $("modal-body").innerHTML    = body;
    $("modal-foot").innerHTML    = footer;
    $("modal").classList.add("open");
}
export function closeModal(): void {
    $("modal").classList.remove("open");
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
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
