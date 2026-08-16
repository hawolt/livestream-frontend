export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";

void initSiteNav(null);

declare const hcaptcha: {
    render(id: string, opts: {
        sitekey: string; size: "invisible";
        callback: (token: string) => void;
        "error-callback": (err: unknown) => void;
        "expired-callback": () => void;
    }): number;
    execute(widgetId: number): void;
    reset(widgetId: number): void;
};
declare const HCAPTCHA_SITEKEY: string;

const form        = document.getElementById("register-form") as HTMLFormElement;

const referralParam = new URLSearchParams(location.search).get("ref");
if (referralParam) {
    const referralEl = document.getElementById("referral") as HTMLInputElement;
    if (referralEl && !referralEl.value) referralEl.value = referralParam;
}
const btnEl       = document.getElementById("btn-register")  as HTMLButtonElement;
const errorEl     = document.getElementById("error")          as HTMLElement;
const loginLinkEl = document.getElementById("login-link")     as HTMLAnchorElement | null;

let widgetId: number | null = null;

export function resolveReturnUrl(rawReturn: string, currentOrigin: string): string | null {
    if (!rawReturn) return null;
    try {
        const url = new URL(rawReturn, currentOrigin);
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        if (isHttp && url.origin === currentOrigin && !url.username && !url.password) return url.toString();
    } catch {}
    return null;
}

export function loginLinkHref(rawReturn: string, currentOrigin: string): string {
    const resolved = resolveReturnUrl(rawReturn, currentOrigin);
    return resolved ? `/login?return=${encodeURIComponent(resolved)}` : "/login";
}

function resolveRedirect(): string {
    const ret = new URLSearchParams(location.search).get("return") ?? "";
    return resolveReturnUrl(ret, location.origin) ?? "/dashboard";
}

if (loginLinkEl) {
    loginLinkEl.href = loginLinkHref(new URLSearchParams(location.search).get("return") ?? "", location.origin);
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
        return;
    }

    const existing = sessionStorage.getItem("dash_token");
    if (existing) {
        const status = await verifyToken(existing);
        if (status === "valid") { location.replace(resolveRedirect()); return; }
        if (status === "invalid") {
            sessionStorage.removeItem("dash_token");
            sessionStorage.removeItem("dash_kind");
        }
    }
}

void boot();

let captchaWatchdog: number | null = null;

function clearWatchdog(): void {
    if (captchaWatchdog !== null) {
        window.clearTimeout(captchaWatchdog);
        captchaWatchdog = null;
    }
}

function onHCaptchaLoad(): void {
    if (widgetId !== null) return;
    widgetId = hcaptcha.render("hcaptcha-container", {
        sitekey:            HCAPTCHA_SITEKEY,
        size:               "invisible",
        callback:           (token) => { clearWatchdog(); void doSubmit(token); },
        "error-callback":   (err)   => { clearWatchdog(); showError(`Captcha error: ${err}`); resetBtn(); },
        "expired-callback": ()      => { clearWatchdog(); resetBtn(); if (widgetId !== null) hcaptcha.reset(widgetId); },
    });
}

(window as unknown as Record<string, unknown>)["onHCaptchaLoad"] = onHCaptchaLoad;
if (typeof hcaptcha !== "undefined") onHCaptchaLoad();

form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    if (widgetId === null) {
        showError("The captcha is still loading. Wait a moment and try again; if this keeps happening, allow js.hcaptcha.com in your content blocker and reload.");
        return;
    }
    btnEl.disabled = true;
    btnEl.textContent = "Creating account...";
    captchaWatchdog = window.setTimeout(() => {
        captchaWatchdog = null;
        showError("The captcha did not respond. Reload the page and try again.");
        resetBtn();
        if (widgetId !== null) hcaptcha.reset(widgetId);
    }, 20000);
    try {
        hcaptcha.execute(widgetId);
    } catch {
        clearWatchdog();
        showError("The captcha failed to start. Reload the page and try again.");
        resetBtn();
    }
});

async function doSubmit(captchaToken: string): Promise<void> {
    const username    = (document.getElementById("username")     as HTMLInputElement).value.trim();
    const email       = (document.getElementById("email")        as HTMLInputElement).value.trim();
    const password    = (document.getElementById("password")     as HTMLInputElement).value;
    const referral    = (document.getElementById("referral")     as HTMLInputElement).value.trim();

    if (!email) {
        showError("Email is required so you can verify your account and reset your password.");
        resetBtn();
        if (widgetId !== null) hcaptcha.reset(widgetId);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
                username,
                password,
                email,
                captchaToken,
                ...(referral ? { referral } : {}),
            }),
        });

        const data = await res.json() as {
            token?: string; error?: string; kind?: string;
        };

        if (!res.ok || !data.token) {
            showError(data.error ?? "Registration failed");
            resetBtn();
            if (widgetId !== null) hcaptcha.reset(widgetId);
            return;
        }

        sessionStorage.setItem("dash_token", data.token);
        if (data.kind) sessionStorage.setItem("dash_kind", data.kind);
        location.href = resolveRedirect();

    } catch (err) {
        showError("Network error - is the server running?");
        resetBtn();
        if (widgetId !== null) hcaptcha.reset(widgetId);
    }
}

function resetBtn(): void {
    btnEl.disabled = false;
    btnEl.textContent = "Create your streaming account";
}

function showError(msg: string): void {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
}
function clearError(): void {
    errorEl.style.display = "none";
}
