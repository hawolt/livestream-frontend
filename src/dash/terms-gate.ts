import { $ } from "./dom.ts";
import { authFetch, signOutAndRedirect } from "./session.ts";
import { consentError, consentFieldForMessage, fillBirthYearSelect, type ConsentField } from "../consent.ts";
import { trapFocus } from "../focus-trap.ts";
import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";
import { ageHint, gateIntro, needsTermsGate, type TermsFlags, type TermsStatus } from "./terms-status.ts";

let open = false;
let wired = false;
let submitting = false;
let currentStatus: TermsStatus | null = null;
let releaseFocus: (() => void) | null = null;
let backgroundState: InertSiblingState[] = [];

function gateError(message: string | null, field: ConsentField | null): void {
    const errorEl = $("terms-gate-error");
    errorEl.textContent = message ?? "";
    errorEl.hidden = message === null;
    $("terms-gate-year").setAttribute("aria-invalid", String(field === "birthYear"));
    $("terms-gate-accept").setAttribute("aria-invalid", String(field === "terms"));
    if (field === "birthYear") $("terms-gate-year").focus();
    if (field === "terms") $("terms-gate-accept").focus();
}

function closeGate(): void {
    if (!open) return;
    open = false;
    currentStatus = null;
    const gate = $("terms-gate");
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    releaseFocus?.();
    releaseFocus = null;
    restoreInertSiblings(backgroundState);
    backgroundState = [];
}

async function submitGate(): Promise<void> {
    const status = currentStatus;
    if (submitting || !status) return;
    const accepted = ($("terms-gate-accept") as HTMLInputElement).checked;
    const yearValue = ($("terms-gate-year") as HTMLSelectElement).value;
    const problem = consentError(accepted, yearValue, status.needsBirthYear);
    if (problem) {
        gateError(problem, consentFieldForMessage(problem));
        return;
    }
    const submitBtn = $("terms-gate-submit") as HTMLButtonElement;
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    gateError(null, null);
    try {
        await authFetch<TermsStatus>("/api/auth/terms", {
            method: "POST",
            body: JSON.stringify({
                termsAccepted: true,
                marketingOptIn: ($("terms-gate-marketing") as HTMLInputElement).checked,
                ...(status.needsBirthYear ? { birthYear: Number(yearValue) } : {}),
            }),
        });
        closeGate();
    } catch (e) {
        const message = (e as Error).message || "Could not save your answer. Try again.";
        gateError(message, consentFieldForMessage(message));
    } finally {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Accept and continue";
    }
}

function render(status: TermsStatus): void {
    $("terms-gate-intro").textContent = gateIntro(status);
    const yearEl = $("terms-gate-year") as HTMLSelectElement;
    $("terms-gate-birth-year").hidden = !status.needsBirthYear;
    yearEl.disabled = !status.needsBirthYear;
    if (status.needsBirthYear) {
        fillBirthYearSelect(yearEl, new Date().getFullYear(), "Select year");
        $("terms-gate-year-hint").textContent = ageHint(status.minAge);
    }
    ($("terms-gate-marketing") as HTMLInputElement).checked = status.marketingOptIn;
    ($("terms-gate-accept") as HTMLInputElement).checked = false;
    gateError(null, null);

    const gate = $("terms-gate");
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    backgroundState = inertSiblings(gate);
    releaseFocus = trapFocus(gate, $("terms-gate-box"));
    requestAnimationFrame(() => {
        if (!open) return;
        const first = status.needsBirthYear ? $("terms-gate-year") : $("terms-gate-accept");
        first.focus();
    });
}

function wire(): void {
    ($("terms-gate-form") as HTMLFormElement).addEventListener("submit", e => {
        e.preventDefault();
        void submitGate();
    });
    $("terms-gate-signout").addEventListener("click", signOutAndRedirect);
}

export async function maybeOpenTermsGate(flags: TermsFlags | null | undefined): Promise<void> {
    if (open || !needsTermsGate(flags)) return;
    let status: TermsStatus;
    try {
        status = await authFetch<TermsStatus>("/api/auth/terms");
    } catch {
        return;
    }
    if (open || !needsTermsGate(status)) return;
    open = true;
    currentStatus = status;
    if (!wired) {
        wire();
        wired = true;
    }
    render(status);
}
