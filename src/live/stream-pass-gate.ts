import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";
import { buyButtonLabel, gateHint } from "../ticket-price.ts";

const gateEl = document.getElementById("stream-pass-gate") as HTMLElement;
const gateBoxEl = gateEl?.querySelector<HTMLElement>(".login-modal-box") as HTMLElement;
const gateFormEl = document.getElementById("stream-pass-form") as HTMLFormElement;
const gateInputEl = document.getElementById("stream-pass-input") as HTMLInputElement;
const gateErrorEl = document.getElementById("stream-pass-error") as HTMLElement;
const gateSubmitEl = document.getElementById("stream-pass-submit") as HTMLButtonElement;
const gateHintEl = document.getElementById("stream-pass-hint") as HTMLElement;
const gateTicketEl = document.getElementById("stream-pass-ticket") as HTMLElement;
const gateTicketBuyEl = document.getElementById("stream-pass-ticket-buy") as HTMLButtonElement;
const gateOrEl = document.getElementById("stream-pass-or") as HTMLElement;

export interface StreamPassGateOptions {
    passwordRequired: boolean;
    ticketRequired: boolean;
    ticketPriceCents?: number | null;
    ticketCurrency?: string | null;
}

let gateWired = false;
let gateBackgroundState: InertSiblingState[] = [];
let activeResolve: ((unlocked: boolean) => void) | null = null;
let activeUsername = "";

function setGateBusy(busy: boolean): void {
    gateFormEl.setAttribute("aria-busy", String(busy));
    gateSubmitEl.disabled = busy;
    gateSubmitEl.textContent = busy ? "Unlocking…" : "Unlock";
}

function hideGate(): void {
    if (gateEl.hidden) return;
    gateEl.hidden = true;
    restoreInertSiblings(gateBackgroundState);
    gateBackgroundState = [];
}

function finish(unlocked: boolean): void {
    const resolve = activeResolve;
    activeResolve = null;
    hideGate();
    resolve?.(unlocked);
}

function trapGateFocus(event: KeyboardEvent): void {
    const focusable = Array.from(gateBoxEl.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) {
        event.preventDefault();
        gateBoxEl.focus();
        return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !gateBoxEl.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !gateBoxEl.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

async function buyTicket(): Promise<void> {
    gateErrorEl.textContent = "";
    gateTicketBuyEl.disabled = true;
    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const token = sessionStorage.getItem("dash_token");
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/main/v1/billing/tickets/checkout", {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ channel: activeUsername }),
        });
        if (res.ok) {
            const body = await res.json() as { url?: string };
            if (body.url) {
                location.href = body.url;
                return;
            }
            gateErrorEl.textContent = "Could not start checkout, please try again.";
        } else if (res.status === 401) {
            gateErrorEl.textContent = "Sign in to buy a ticket.";
        } else {
            const body = await res.json().catch(() => ({})) as { error?: string };
            gateErrorEl.textContent = body.error || "Could not start checkout, please try again.";
        }
    } catch {
        gateErrorEl.textContent = "Could not reach the server. Check your connection and try again.";
    } finally {
        gateTicketBuyEl.disabled = false;
    }
}

function wireGate(): void {
    if (gateWired) return;
    gateWired = true;
    document.addEventListener("keydown", (e) => {
        if (gateEl.hidden) return;
        if (e.key === "Tab") trapGateFocus(e);
    });
    gateTicketBuyEl.addEventListener("click", () => void buyTicket());
    gateFormEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeResolve) return;
        const password = gateInputEl.value;
        if (!password) return;
        gateErrorEl.textContent = "";
        setGateBusy(true);
        try {
            const res = await fetch(`/api/live/channel/${encodeURIComponent(activeUsername)}/unlock`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                gateInputEl.value = "";
                finish(true);
                return;
            }
            if (res.status === 403) {
                gateErrorEl.textContent = "Wrong password.";
            } else if (res.status === 429) {
                gateErrorEl.textContent = "Too many attempts, please wait a moment.";
            } else {
                const body = await res.json().catch(() => ({})) as { error?: string };
                gateErrorEl.textContent = body.error || "Unlock failed, please try again.";
            }
        } catch {
            gateErrorEl.textContent = "Could not reach the server. Check your connection and try again.";
        } finally {
            setGateBusy(false);
        }
    });
}

function applyOptions(options: StreamPassGateOptions): void {
    gateHintEl.textContent = gateHint(options);
    gateTicketEl.hidden = !options.ticketRequired;
    gateOrEl.hidden = !(options.ticketRequired && options.passwordRequired);
    gateFormEl.hidden = !options.passwordRequired;
    gateInputEl.required = options.passwordRequired;
    if (options.ticketRequired) {
        gateTicketBuyEl.textContent = buyButtonLabel(options.ticketPriceCents, options.ticketCurrency);
    }
}

export function promptStreamPassword(
    username: string,
    signal: AbortSignal,
    options: StreamPassGateOptions,
): Promise<boolean> {
    wireGate();
    activeResolve?.(false);
    activeUsername = username;
    gateErrorEl.textContent = "";
    setGateBusy(false);
    applyOptions(options);
    if (gateEl.hidden) {
        gateBackgroundState = inertSiblings(gateEl);
        gateEl.hidden = false;
    }
    if (options.passwordRequired) gateInputEl.focus();
    else gateTicketBuyEl.focus();
    return new Promise<boolean>((resolve) => {
        activeResolve = resolve;
        signal.addEventListener("abort", () => {
            if (activeResolve === resolve) finish(false);
        }, { once: true });
    });
}
