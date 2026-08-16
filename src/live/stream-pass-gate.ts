import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";

const gateEl = document.getElementById("stream-pass-gate") as HTMLElement;
const gateBoxEl = gateEl?.querySelector<HTMLElement>(".login-modal-box") as HTMLElement;
const gateFormEl = document.getElementById("stream-pass-form") as HTMLFormElement;
const gateInputEl = document.getElementById("stream-pass-input") as HTMLInputElement;
const gateErrorEl = document.getElementById("stream-pass-error") as HTMLElement;
const gateSubmitEl = document.getElementById("stream-pass-submit") as HTMLButtonElement;
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

function wireGate(): void {
    if (gateWired) return;
    gateWired = true;
    document.addEventListener("keydown", (e) => {
        if (gateEl.hidden) return;
        if (e.key === "Tab") trapGateFocus(e);
    });
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

export function promptStreamPassword(username: string, signal: AbortSignal): Promise<boolean> {
    wireGate();
    activeResolve?.(false);
    activeUsername = username;
    gateErrorEl.textContent = "";
    setGateBusy(false);
    if (gateEl.hidden) {
        gateBackgroundState = inertSiblings(gateEl);
        gateEl.hidden = false;
    }
    gateInputEl.focus();
    return new Promise<boolean>((resolve) => {
        activeResolve = resolve;
        signal.addEventListener("abort", () => {
            if (activeResolve === resolve) finish(false);
        }, { once: true });
    });
}
