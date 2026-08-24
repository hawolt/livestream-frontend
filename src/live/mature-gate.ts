import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";
import { trapFocus } from "../focus-trap.ts";

const gateEl = document.getElementById("mature-gate") as HTMLElement;
const gateBoxEl = gateEl?.querySelector<HTMLElement>(".login-modal-box") as HTMLElement;
const gateChannelEl = document.getElementById("mature-gate-channel") as HTMLElement;
const gateConfirmEl = document.getElementById("mature-gate-confirm") as HTMLButtonElement;
const gateLeaveEl = document.getElementById("mature-gate-leave") as HTMLAnchorElement;

let gateWired = false;
let gateBackgroundState: InertSiblingState[] = [];
let releaseFocusTrap: (() => void) | null = null;
let activeResolve: ((allowed: boolean) => void) | null = null;

function hideGate(): void {
    if (gateEl.hidden) return;
    gateEl.hidden = true;
    releaseFocusTrap?.();
    releaseFocusTrap = null;
    restoreInertSiblings(gateBackgroundState);
    gateBackgroundState = [];
}

function finish(allowed: boolean): void {
    const resolve = activeResolve;
    activeResolve = null;
    hideGate();
    resolve?.(allowed);
}

function wireGate(): void {
    if (gateWired) return;
    gateWired = true;
    gateConfirmEl.addEventListener("click", () => {
        if (!activeResolve) return;
        finish(true);
    });
    gateLeaveEl.addEventListener("click", () => finish(false));
}

export function promptMatureGate(username: string, signal: AbortSignal): Promise<boolean> {
    if (!gateEl) return Promise.resolve(false);
    wireGate();
    activeResolve?.(false);
    gateChannelEl.textContent = username;
    if (gateEl.hidden) {
        gateBackgroundState = inertSiblings(gateEl);
        gateEl.hidden = false;
        releaseFocusTrap = trapFocus(gateBoxEl, gateConfirmEl);
    }
    gateConfirmEl.focus();
    return new Promise<boolean>((resolve) => {
        activeResolve = resolve;
        signal.addEventListener("abort", () => {
            if (activeResolve === resolve) finish(false);
        }, { once: true });
    });
}
