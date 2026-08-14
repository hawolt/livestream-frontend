import {
    followBtnEl,
    loginModalAltEl,
    loginModalBoxEl,
    loginModalCloseEl,
    loginModalEl,
    loginModalErrorEl,
    loginModalFormEl,
    loginModalPassEl,
    loginModalSignupEl,
    loginModalSubmitEl,
    loginModalTitleEl,
    loginModalUserEl,
    signupModalAltEl,
    signupModalBackEl,
    signupModalCaptchaEl,
    signupModalEmailEl,
    signupModalErrorEl,
    signupModalFallbackEl,
    signupModalFormEl,
    signupModalPassEl,
    signupModalSubmitEl,
    signupModalUserEl,
} from "./dom.ts";
import { ctx } from "./player/context.ts";
import { API_BASE } from "../api.ts";
import { reconnectChatAfterLogin } from "../live-chat.ts";
import { isPopoutMode } from "./layout.ts";
import { canAutoFollow, initFollow } from "./follow.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";
import { loginModalSignupHref, postLoginRedirectTarget } from "./subscribe-destination.ts";
import { HCAPTCHA_LOAD_TIMEOUT_MS, HCAPTCHA_SCRIPT_SRC, HCAPTCHA_SITEKEY } from "./constants.ts";

export type LoginIntent = "follow" | "chat" | "clip" | "subscribe";
type LoginModalView = "login" | "signup";

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

let loginIntent: LoginIntent = "follow";
let loginModalWired = false;
let loginRestoreFocus: HTMLElement | null = null;
let loginAbort: AbortController | null = null;
let loginBackgroundState: InertSiblingState[] = [];

let signupAbort: AbortController | null = null;
let signupWidgetId: number | null = null;
let signupWatchdog: number | null = null;
let hcaptchaScriptEl: HTMLScriptElement | null = null;

function channelPath(): string {
    return `/${ctx.username}`;
}

function loginTitleForIntent(intent: LoginIntent): string {
    return intent === "follow"
        ? `Log in to follow ${ctx.displayUsername}`
        : intent === "clip"
        ? "Log in to create a clip"
        : intent === "subscribe"
        ? "Sign in to subscribe"
        : "Log in to chat";
}

function setLoginModalView(view: LoginModalView): void {
    loginModalErrorEl.textContent = "";
    signupModalErrorEl.textContent = "";
    loginModalFormEl.hidden = view !== "login";
    loginModalAltEl.hidden = view !== "login";
    signupModalFormEl.hidden = view !== "signup";
    signupModalAltEl.hidden = view !== "signup";
    loginModalTitleEl.textContent = view === "signup" ? "Create your account" : loginTitleForIntent(loginIntent);
}

export function openLoginModal(intent: LoginIntent): void {
    loginIntent = intent;
    const signupHref = loginModalSignupHref(intent, location.href, channelPath());
    loginModalSignupEl.href = signupHref;
    signupModalFallbackEl.href = signupHref;
    setLoginModalView("login");
    if (loginModalEl.hidden) {
        loginRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        loginBackgroundState = inertSiblings(loginModalEl);
    }
    loginModalEl.hidden = false;
    openDismissibleSurface(loginModalEl, closeLoginModal);
    loginModalUserEl.focus();
}

function setLoginBusy(busy: boolean): void {
    loginModalFormEl.setAttribute("aria-busy", String(busy));
    loginModalSubmitEl.disabled = busy;
    loginModalSubmitEl.textContent = busy ? "Logging in…" : "Log in";
}

function setSignupBusy(busy: boolean): void {
    signupModalFormEl.setAttribute("aria-busy", String(busy));
    signupModalSubmitEl.disabled = busy;
    signupModalSubmitEl.textContent = busy ? "Creating account…" : "Create account";
}

function clearSignupWatchdog(): void {
    if (signupWatchdog !== null) {
        window.clearTimeout(signupWatchdog);
        signupWatchdog = null;
    }
}

function closeLoginModal(): void {
    if (loginModalEl.hidden) return;
    loginAbort?.abort();
    loginAbort = null;
    setLoginBusy(false);
    signupAbort?.abort();
    signupAbort = null;
    clearSignupWatchdog();
    setSignupBusy(false);
    loginModalEl.hidden = true;
    closeDismissibleSurface(loginModalEl);
    restoreInertSiblings(loginBackgroundState);
    loginBackgroundState = [];
    const restore = loginRestoreFocus;
    loginRestoreFocus = null;
    if (restore?.isConnected) restore.focus();
}

function trapLoginFocus(event: KeyboardEvent): void {
    const focusable = Array.from(loginModalBoxEl.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    )).filter(el => el.offsetParent !== null);
    if (!focusable.length) {
        event.preventDefault();
        loginModalBoxEl.focus();
        return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !loginModalBoxEl.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !loginModalBoxEl.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

async function completeAuthenticatedIntent(intent: LoginIntent): Promise<void> {
    closeLoginModal();
    const redirectTarget = postLoginRedirectTarget(intent, channelPath());
    if (redirectTarget) {
        location.href = redirectTarget;
        return;
    }
    reconnectChatAfterLogin();
    if (!isPopoutMode()) await initFollow();
    if (intent === "follow" && canAutoFollow()) followBtnEl.click();
    if (intent === "clip") window.open(`/clip/create?channel=${encodeURIComponent(ctx.username)}`, "_blank");
}

function loadHcaptchaScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (typeof (window as unknown as { hcaptcha?: unknown }).hcaptcha !== "undefined") {
            resolve();
            return;
        }
        if (!hcaptchaScriptEl) {
            hcaptchaScriptEl = document.createElement("script");
            hcaptchaScriptEl.src = HCAPTCHA_SCRIPT_SRC;
            hcaptchaScriptEl.async = true;
            document.head.appendChild(hcaptchaScriptEl);
        }
        const timeout = window.setTimeout(() => {
            reject(new Error("hcaptcha script load timed out"));
        }, HCAPTCHA_LOAD_TIMEOUT_MS);
        hcaptchaScriptEl.addEventListener("load", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
        hcaptchaScriptEl.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("hcaptcha script failed to load")); }, { once: true });
    });
}

async function ensureSignupCaptcha(): Promise<void> {
    if (signupWidgetId !== null) return;
    try {
        await loadHcaptchaScript();
    } catch {
        signupModalErrorEl.textContent = "The captcha is still loading. Wait a moment and try again; if this keeps happening, allow js.hcaptcha.com in your content blocker and reload.";
        return;
    }
    if (signupWidgetId !== null) return;
    signupWidgetId = hcaptcha.render(signupModalCaptchaEl.id, {
        sitekey:            HCAPTCHA_SITEKEY,
        size:               "invisible",
        callback:           (token) => { clearSignupWatchdog(); void submitSignup(token); },
        "error-callback":   (err)   => { clearSignupWatchdog(); signupModalErrorEl.textContent = `Captcha error: ${err}`; setSignupBusy(false); },
        "expired-callback": ()      => { clearSignupWatchdog(); setSignupBusy(false); if (signupWidgetId !== null) hcaptcha.reset(signupWidgetId); },
    });
}

async function submitSignup(captchaToken: string): Promise<void> {
    const username = signupModalUserEl.value.trim();
    const email = signupModalEmailEl.value.trim();
    const password = signupModalPassEl.value;
    if (!email) {
        signupModalErrorEl.textContent = "Email is required so you can verify your account and reset your password.";
        setSignupBusy(false);
        if (signupWidgetId !== null) hcaptcha.reset(signupWidgetId);
        return;
    }
    const intent = loginIntent;
    const controller = new AbortController();
    signupAbort?.abort();
    signupAbort = controller;
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, email, captchaToken }),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => ({})) as {
            token?: string; error?: string; kind?: string;
        };
        if (!res.ok || !data.token) {
            signupModalErrorEl.textContent = data.error ?? "Registration failed";
            setSignupBusy(false);
            if (signupWidgetId !== null) hcaptcha.reset(signupWidgetId);
            return;
        }
        sessionStorage.setItem("dash_token", data.token);
        if (data.kind) sessionStorage.setItem("dash_kind", data.kind);
        else sessionStorage.removeItem("dash_kind");
        signupModalPassEl.value = "";
        signupAbort = null;
        await completeAuthenticatedIntent(intent);
    } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
            signupModalErrorEl.textContent = "Network error - is the server running?";
            setSignupBusy(false);
            if (signupWidgetId !== null) hcaptcha.reset(signupWidgetId);
        }
    } finally {
        if (signupAbort === controller) {
            signupAbort = null;
            setSignupBusy(false);
        }
    }
}

export function wireLoginModal(): void {
    if (loginModalWired) return;
    loginModalWired = true;
    loginModalCloseEl.addEventListener("click", () => closeLoginModal());
    loginModalEl.addEventListener("click", (e) => {
        if (e.target === loginModalEl) closeLoginModal();
    });
    document.addEventListener("keydown", (e) => {
        if (loginModalEl.hidden) return;
        if (e.key === "Tab") trapLoginFocus(e);
    });
    loginModalSignupEl.addEventListener("click", (e) => {
        e.preventDefault();
        setLoginModalView("signup");
        void ensureSignupCaptcha();
        signupModalUserEl.focus();
    });
    signupModalBackEl.addEventListener("click", (e) => {
        e.preventDefault();
        setLoginModalView("login");
        loginModalUserEl.focus();
    });
    signupModalFormEl.addEventListener("submit", (e) => {
        e.preventDefault();
        signupModalErrorEl.textContent = "";
        if (signupWidgetId === null) {
            signupModalErrorEl.textContent = "The captcha is still loading. Wait a moment and try again; if this keeps happening, allow js.hcaptcha.com in your content blocker and reload.";
            return;
        }
        setSignupBusy(true);
        signupWatchdog = window.setTimeout(() => {
            signupWatchdog = null;
            signupModalErrorEl.textContent = "The captcha did not respond. Reload the page and try again.";
            setSignupBusy(false);
            if (signupWidgetId !== null) hcaptcha.reset(signupWidgetId);
        }, 20000);
        try {
            hcaptcha.execute(signupWidgetId);
        } catch {
            clearSignupWatchdog();
            signupModalErrorEl.textContent = "The captcha failed to start. Reload the page and try again.";
            setSignupBusy(false);
        }
    });
    loginModalFormEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = loginModalUserEl.value.trim();
        const pass = loginModalPassEl.value;
        if (!user || !pass) return;
        loginModalErrorEl.textContent = "";
        const intent = loginIntent;
        const controller = new AbortController();
        loginAbort?.abort();
        loginAbort = controller;
        setLoginBusy(true);
        try {
            const r = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user, password: pass }),
                signal: controller.signal,
            });
            const result = await r.json().catch(() => ({})) as {
                token?: string;
                kind?: string;
                error?: string;
                retryAfter?: number;
            };
            if (!r.ok || !result.token) {
                if (r.status === 429) {
                    const wait = result.retryAfter ? ` Try again in ${result.retryAfter} seconds.` : " Please try again later.";
                    loginModalErrorEl.textContent = `Too many login attempts.${wait}`;
                } else if (r.status === 401 || r.status === 403) {
                    loginModalErrorEl.textContent = "Invalid username or password.";
                } else {
                    loginModalErrorEl.textContent = result.error || "Login is unavailable. Please try again.";
                }
                return;
            }
            sessionStorage.setItem("dash_token", result.token);
            if (result.kind) sessionStorage.setItem("dash_kind", result.kind);
            else sessionStorage.removeItem("dash_kind");
            loginModalPassEl.value = "";
            loginAbort = null;
            await completeAuthenticatedIntent(intent);
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                loginModalErrorEl.textContent = "Could not reach the login service. Check your connection and try again.";
            }
        } finally {
            if (loginAbort === controller) {
                loginAbort = null;
                setLoginBusy(false);
            }
        }
    });
}
