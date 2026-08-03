import { API_BASE } from "../api.ts";
import { sessionTokenMetadata } from "../session-token.ts";

async function bootstrapFromCookie(): Promise<string | null> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (!res.ok) return null;
        const data = await res.json() as { token?: string; kind?: string };
        if (!data.token || data.kind !== "user") return null;
        return data.token;
    } catch {
        return null;
    }
}

export async function ensureSession(): Promise<string | null> {
    const existing = sessionStorage.getItem("dash_token") ?? "";
    if (sessionTokenMetadata(existing)) return existing;
    const fromCookie = await bootstrapFromCookie();
    if (fromCookie && sessionTokenMetadata(fromCookie)) {
        sessionStorage.setItem("dash_token", fromCookie);
        sessionStorage.setItem("dash_kind", "user");
        return fromCookie;
    }
    return null;
}

export function redirectToLogin(): void {
    location.replace(`/login?return=${encodeURIComponent(location.href)}`);
}

export function currentToken(): string {
    return sessionStorage.getItem("dash_token") ?? "";
}
