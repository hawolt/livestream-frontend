import { API_BASE } from "./api.ts";
import {
    consentError, consentFieldForMessage, wireBirthDateSelects,
    isoBirthDate, type BirthDateParts, type ConsentField,
} from "./consent.ts";
import { trapFocus } from "./focus-trap.ts";
import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "./inert-siblings.ts";
import { ageHint, gateIntro, needsTermsGate, type TermsFlags, type TermsStatus } from "./dash/terms-status.ts";

const EXEMPT_PATHS = new Set([
    "/terms", "/privacy", "/impressum", "/login", "/register",
    "/verify", "/reset-password",
]);

export function termsGateAllowedOn(pathname: string): boolean {
    const path = pathname.replace(/\/+$/, "") || "/";
    if (EXEMPT_PATHS.has(path)) return false;
    return !path.startsWith("/chat/") && !path.startsWith("/alerts/") && !path.startsWith("/embed");
}

let open = false;
let submitting = false;
let root: HTMLElement | null = null;
let releaseFocus: (() => void) | null = null;
let backgroundState: InertSiblingState[] = [];

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, attrs: Record<string, string> = {}, text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
}

function build(): HTMLElement {
    const gate = el("div", { id: "terms-gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "terms-gate-title" });
    const box = el("div", { id: "terms-gate-box", tabindex: "-1" });
    box.appendChild(el("h2", { id: "terms-gate-title" }, "Before you continue"));
    box.appendChild(el("p", { id: "terms-gate-intro" }));

    const form = el("form", { id: "terms-gate-form", novalidate: "" });

    const birth = el("div", { id: "terms-gate-birth" });
    birth.appendChild(el("label", { class: "login-field-label", for: "terms-gate-day" }, "Date of birth"));
    const row = el("div", { id: "terms-gate-birth-row" });
    const day = el("select", { id: "terms-gate-day", autocomplete: "bday-day", "aria-label": "Day" });
    const month = el("select", { id: "terms-gate-month", autocomplete: "bday-month", "aria-label": "Month" });
    const year = el("select", { id: "terms-gate-year", autocomplete: "bday-year", "aria-label": "Year" });
    row.append(day, month, year);
    birth.appendChild(row);
    birth.appendChild(el("div", { class: "login-hint", id: "terms-gate-hint" }));
    form.appendChild(birth);

    const consent = el("div", { class: "login-consent" });
    const acceptRow = el("label", { class: "login-consent-row" });
    const accept = el("input", { id: "terms-gate-accept", type: "checkbox" });
    const acceptText = el("span");
    acceptText.append(
        document.createTextNode("I accept the "),
        el("a", { href: "/terms", target: "_blank", rel: "noopener" }, "Terms of Service"),
        document.createTextNode(" and the "),
        el("a", { href: "/privacy", target: "_blank", rel: "noopener" }, "Privacy Policy"),
        document.createTextNode("."),
    );
    acceptRow.append(accept, acceptText);
    const marketingRow = el("label", { class: "login-consent-row" });
    const marketing = el("input", { id: "terms-gate-marketing", type: "checkbox" });
    marketingRow.append(marketing, el("span", {}, "Email me product news and offers. Optional, and you can unsubscribe at any time."));
    consent.append(acceptRow, marketingRow);
    form.appendChild(consent);

    form.appendChild(el("div", { id: "terms-gate-error", role: "alert", hidden: "" }));
    const actions = el("div", { id: "terms-gate-actions" });
    actions.append(
        el("button", { type: "button", id: "terms-gate-signout", class: "btn" }, "Sign out"),
        el("button", { type: "submit", id: "terms-gate-submit", class: "btn btn-primary" }, "Accept and continue"),
    );
    form.appendChild(actions);
    box.appendChild(form);
    gate.appendChild(box);
    return gate;
}

function pick<T extends HTMLElement>(id: string): T {
    return root!.querySelector<T>(`#${id}`)!;
}

function parts(): BirthDateParts {
    return {
        day: pick<HTMLSelectElement>("terms-gate-day").value,
        month: pick<HTMLSelectElement>("terms-gate-month").value,
        year: pick<HTMLSelectElement>("terms-gate-year").value,
    };
}

function showError(message: string | null, field: ConsentField | null): void {
    const errorEl = pick("terms-gate-error");
    errorEl.textContent = message ?? "";
    errorEl.hidden = message === null;
    pick("terms-gate-accept").setAttribute("aria-invalid", String(field === "terms"));
    for (const id of ["terms-gate-day", "terms-gate-month", "terms-gate-year"]) {
        pick(id).setAttribute("aria-invalid", String(field === "birthDate"));
    }
    if (field === "birthDate") pick("terms-gate-day").focus();
    if (field === "terms") pick("terms-gate-accept").focus();
}

function close(): void {
    if (!open || !root) return;
    open = false;
    releaseFocus?.();
    releaseFocus = null;
    restoreInertSiblings(backgroundState);
    backgroundState = [];
    root.remove();
    root = null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = sessionStorage.getItem("dash_token") ?? "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers });
    const body = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? "Could not save your answer. Try again.");
    return body as T;
}

async function submit(status: TermsStatus): Promise<void> {
    if (submitting) return;
    const accepted = pick<HTMLInputElement>("terms-gate-accept").checked;
    const problem = consentError(accepted, parts(), status.needsBirthDate, new Date());
    if (problem) {
        showError(problem, consentFieldForMessage(problem));
        return;
    }
    const submitBtn = pick<HTMLButtonElement>("terms-gate-submit");
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    showError(null, null);
    try {
        await request("/auth/terms", {
            method: "POST",
            body: JSON.stringify({
                termsAccepted: true,
                marketingOptIn: pick<HTMLInputElement>("terms-gate-marketing").checked,
                ...(status.needsBirthDate ? { birthDate: isoBirthDate(parts()) } : {}),
            }),
        });
        close();
        location.reload();
    } catch (e) {
        const message = (e as Error).message;
        showError(message, consentFieldForMessage(message));
    } finally {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Accept and continue";
    }
}

async function signOut(): Promise<void> {
    try {
        await request("/auth/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem("dash_token");
    sessionStorage.removeItem("dash_kind");
    location.href = "/";
}

function render(status: TermsStatus): void {
    root = build();
    document.body.appendChild(root);
    pick("terms-gate-intro").textContent = gateIntro(status);
    const birth = pick("terms-gate-birth");
    birth.hidden = !status.needsBirthDate;
    if (status.needsBirthDate) {
        wireBirthDateSelects(
            pick<HTMLSelectElement>("terms-gate-day"),
            pick<HTMLSelectElement>("terms-gate-month"),
            pick<HTMLSelectElement>("terms-gate-year"),
            new Date().getUTCFullYear(),
        );
        pick("terms-gate-hint").textContent = ageHint(status.minAge);
    }
    pick<HTMLInputElement>("terms-gate-marketing").checked = status.marketingOptIn;
    pick<HTMLFormElement>("terms-gate-form").addEventListener("submit", e => {
        e.preventDefault();
        void submit(status);
    });
    pick("terms-gate-signout").addEventListener("click", () => void signOut());
    backgroundState = inertSiblings(root);
    releaseFocus = trapFocus(root, pick("terms-gate-box"));
    requestAnimationFrame(() => {
        if (!open) return;
        (status.needsBirthDate ? pick("terms-gate-day") : pick("terms-gate-accept")).focus();
    });
}

export async function maybeOpenTermsGate(flags: TermsFlags | null | undefined): Promise<void> {
    if (open || !needsTermsGate(flags)) return;
    if (!termsGateAllowedOn(location.pathname)) return;
    let status: TermsStatus;
    try {
        status = await request<TermsStatus>("/auth/terms");
    } catch {
        return;
    }
    if (open || !needsTermsGate(status)) return;
    open = true;
    render(status);
}
