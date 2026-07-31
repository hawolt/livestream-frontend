import {
    followBtnEl,
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
} from "./dom.ts";
import { ctx } from "./player/context.ts";
import { API_BASE } from "../api.ts";
import { reconnectChatAfterLogin } from "../live-chat.ts";
import { isPopoutMode } from "./layout.ts";
import { canAutoFollow, initFollow } from "./follow.ts";

export type LoginIntent = "follow" | "chat";

let loginIntent: LoginIntent = "follow";
let loginModalWired = false;
let loginRestoreFocus: HTMLElement | null = null;
let loginAbort: AbortController | null = null;

export function openLoginModal(intent: LoginIntent): void {
    loginIntent = intent;
    loginModalErrorEl.textContent = "";
    loginModalTitleEl.textContent = intent === "follow" ? `Log in to follow ${ctx.displayUsername}` : "Log in to chat";
    loginModalSignupEl.href = `/register?return=${encodeURIComponent(location.href)}`;
    if (loginModalEl.hidden) {
        loginRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    loginModalEl.hidden = false;
    loginModalUserEl.focus();
}

function setLoginBusy(busy: boolean): void {
    loginModalFormEl.setAttribute("aria-busy", String(busy));
    loginModalSubmitEl.disabled = busy;
    loginModalSubmitEl.textContent = busy ? "Logging in…" : "Log in";
}

function closeLoginModal(): void {
    if (loginModalEl.hidden) return;
    loginAbort?.abort();
    loginAbort = null;
    setLoginBusy(false);
    loginModalEl.hidden = true;
    const restore = loginRestoreFocus;
    loginRestoreFocus = null;
    if (restore?.isConnected) restore.focus();
}

function trapLoginFocus(event: KeyboardEvent): void {
    const focusable = Array.from(loginModalBoxEl.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ));
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

export function wireLoginModal(): void {
    if (loginModalWired) return;
    loginModalWired = true;
    loginModalCloseEl.addEventListener("click", () => closeLoginModal());
    loginModalEl.addEventListener("click", (e) => {
        if (e.target === loginModalEl) closeLoginModal();
    });
    document.addEventListener("keydown", (e) => {
        if (loginModalEl.hidden) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closeLoginModal();
        } else if (e.key === "Tab") {
            trapLoginFocus(e);
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
            closeLoginModal();
            reconnectChatAfterLogin();
            if (!isPopoutMode()) await initFollow();
            if (intent === "follow" && canAutoFollow()) followBtnEl.click();
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
