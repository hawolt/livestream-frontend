export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";

void initSiteNav(null);

const form    = document.getElementById("login-form") as HTMLFormElement;
const btnEl   = document.getElementById("btn-login")  as HTMLButtonElement;
const errorEl = document.getElementById("error")      as HTMLElement;
const lockEl  = document.getElementById("lockout")    as HTMLElement;

document.getElementById("btn-show-forgot")!.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("section-login")!.style.display = "none";
    document.getElementById("section-forgot")!.style.display = "";
});
document.getElementById("btn-back-login")!.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("section-login")!.style.display = "";
    document.getElementById("section-forgot")!.style.display = "none";
    document.getElementById("forgot-msg")!.textContent = "";
});
document.getElementById("forgot-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("forgot-email") as HTMLInputElement).value.trim();
    const btn   = document.getElementById("btn-forgot") as HTMLButtonElement;
    const msg   = document.getElementById("forgot-msg")!;
    btn.disabled = true;
    btn.textContent = "Sending…";
    msg.textContent = "";
    try {
        await fetch(`${API_BASE}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        msg.textContent = "If that email is registered you will receive a reset link shortly.";
        msg.style.color = "var(--green)";
    } catch {
        msg.textContent = "Network error, please try again.";
        msg.style.color = "var(--red)";
    } finally {
        btn.disabled = false;
        btn.textContent = "Send reset link";
    }
});

let countdownTimer: ReturnType<typeof setInterval> | null = null;

function showLoginPage(): void {
    document.getElementById("login-page")?.removeAttribute("hidden");
}

export function resolveReturnUrl(rawReturn: string, currentOrigin: string): string | null {
    if (!rawReturn) return null;
    try {
        const url = new URL(rawReturn, currentOrigin);
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        if (isHttp && url.origin === currentOrigin && !url.username && !url.password) return url.toString();
    } catch {}
    return null;
}

function resolveRedirect(): string {
    const ret = new URLSearchParams(location.search).get("return") ?? "";
    return resolveReturnUrl(ret, location.origin) ?? "/dashboard";
}

async function verifyToken(token: string): Promise<"valid" | "invalid" | "unavailable"> {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { "Authorization": `Bearer ${token}` },
            credentials: "include",
        });
        if (res.ok) {
            const data = await res.json().catch(() => null) as { token?: string; kind?: string } | null;
            if (!data?.token || data.kind !== "user") return "invalid";
            sessionStorage.setItem("dash_token", data.token);
            sessionStorage.setItem("dash_kind", data.kind);
            return "valid";
        }
        return res.status === 401 ? "invalid" : "unavailable";
    } catch {
        return "unavailable";
    }
}

async function bootFromCookie(): Promise<"authenticated" | "unauthenticated" | "unavailable" | "mismatch"> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (res.status === 401) return "unauthenticated";
        if (!res.ok) return "unavailable";
        const data = await res.json() as { token?: string; kind?: string };
        if (!data.token || !data.kind) return "unavailable";
        if (data.kind !== "user") return "mismatch";
        sessionStorage.setItem("dash_token", data.token);
        sessionStorage.setItem("dash_kind", data.kind);
        return "authenticated";
    } catch {
        return "unavailable";
    }
}

async function boot(): Promise<void> {
    const cookie = await bootFromCookie();
    if (cookie === "authenticated") {
        location.replace(resolveRedirect());
        return;
    }
    if (cookie === "mismatch") {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        showLoginPage();
        return;
    }

    const existing = sessionStorage.getItem("dash_token");
    const existingKind = sessionStorage.getItem("dash_kind");
    if (existing && (existingKind === "user" || !existingKind)) {
        const status = await verifyToken(existing);
        if (status === "valid") { location.replace(resolveRedirect()); return; }
        if (status === "invalid") {
            sessionStorage.removeItem("dash_token");
            sessionStorage.removeItem("dash_kind");
        } else {
            showLoginPage();
            showError("Could not verify your existing login. Check your connection and try again.");
            return;
        }
    }
    showLoginPage();
    if (cookie === "unavailable") {
        showError("Could not check your existing login. You can retry or sign in again.");
    }
}

void boot();

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    btnEl.disabled = true;
    btnEl.textContent = "Signing in…";

    const username = (document.getElementById("username") as HTMLInputElement).value.trim();
    const password = (document.getElementById("password") as HTMLInputElement).value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ username, password }),
        });

        const data = await res.json() as { token?: string; error?: string; retryAfter?: number; tenantId?: number; kind?: string };

        if (res.status === 429) {
            startLockoutCountdown(data.retryAfter ?? 180);
            btnEl.disabled = true;
            return;
        }

        if (!res.ok || !data.token) {
            showError(data.error ?? "Login failed");
            btnEl.disabled = false;
            btnEl.textContent = "Sign In";
            return;
        }

        sessionStorage.setItem("dash_token", data.token);
        if (data.kind) sessionStorage.setItem("dash_kind", data.kind);
        location.href = resolveRedirect();

    } catch (err) {
        showError("Network error - is the server running?");
        btnEl.disabled = false;
        btnEl.textContent = "Sign In";
    }
});

function showError(msg: string): void {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
}

function clearMessages(): void {
    errorEl.style.display = "none";
    lockEl.style.display  = "none";
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

function startLockoutCountdown(seconds: number): void {
    let remaining = seconds;
    lockEl.style.display = "block";
    lockEl.textContent   = `Too many attempts - try again in ${remaining}s`;
    btnEl.textContent    = "Locked out…";

    countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(countdownTimer!);
            countdownTimer = null;
            lockEl.style.display = "none";
            btnEl.disabled   = false;
            btnEl.textContent = "Sign In";
        } else {
            lockEl.textContent = `Too many attempts - try again in ${remaining}s`;
        }
    }, 1000);
}
