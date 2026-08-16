export type BannerOutcome =
    | { kind: "ok"; degraded: boolean; services: string[] }
    | { kind: "server-error" }
    | { kind: "network-error" };

export interface BannerState {
    serverErrors: number;
    mode: "hidden" | "degraded" | "outage";
    services: string[];
}

export const INITIAL_BANNER_STATE: BannerState = { serverErrors: 0, mode: "hidden", services: [] };
export const OUTAGE_ERROR_THRESHOLD = 3;

const POLL_MS = 60_000;

export function nextBannerState(state: BannerState, outcome: BannerOutcome): BannerState {
    if (outcome.kind === "ok") {
        return outcome.degraded && outcome.services.length > 0
            ? { serverErrors: 0, mode: "degraded", services: outcome.services }
            : { serverErrors: 0, mode: "hidden", services: [] };
    }
    if (outcome.kind === "server-error") {
        const serverErrors = state.serverErrors + 1;
        if (serverErrors >= OUTAGE_ERROR_THRESHOLD) {
            return { serverErrors, mode: "outage", services: [] };
        }
        return { ...state, serverErrors };
    }
    return state;
}

export function bannerMessage(state: BannerState): string | null {
    if (state.mode === "degraded") return `Degraded performance: ${state.services.join(", ")}.`;
    if (state.mode === "outage") return "We're having technical difficulties. Some features may be unavailable.";
    return null;
}

export function bannerSignature(state: BannerState): string {
    return `${state.mode}|${state.services.join(",")}`;
}

async function fetchOutcome(): Promise<BannerOutcome> {
    try {
        const res = await fetch("/api/status/banner", { cache: "no-store" });
        if (res.ok) {
            const body = await res.json() as { degraded?: unknown; services?: unknown };
            const services = Array.isArray(body.services)
                ? body.services.filter((s): s is string => typeof s === "string")
                : [];
            return { kind: "ok", degraded: body.degraded === true, services };
        }
        return res.status >= 500 ? { kind: "server-error" } : { kind: "network-error" };
    } catch {
        return { kind: "network-error" };
    }
}

const WARNING_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

let currentState: BannerState = INITIAL_BANNER_STATE;
let tipEl: HTMLDivElement | null = null;
let tipPinned = false;
let hideTimer: number | null = null;

function removeTip(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
    tipEl?.remove();
    tipEl = null;
    tipPinned = false;
}

function scheduleHide(): void {
    if (tipPinned) return;
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(removeTip, 200);
}

function cancelHide(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
}

function buildTip(anchor: HTMLElement): HTMLDivElement {
    const tip = document.createElement("div");
    tip.className = "status-tip";
    tip.setAttribute("role", "status");

    const title = document.createElement("div");
    title.className = "status-tip-title";
    title.textContent = currentState.mode === "outage" ? "Technical difficulties" : "Degraded performance";
    tip.appendChild(title);

    if (currentState.mode === "outage") {
        const line = document.createElement("div");
        line.className = "status-tip-service";
        line.textContent = "Some features may be unavailable.";
        tip.appendChild(line);
    }
    for (const service of currentState.services) {
        const line = document.createElement("div");
        line.className = "status-tip-service";
        line.textContent = service;
        tip.appendChild(line);
    }

    const link = document.createElement("a");
    link.className = "status-tip-link";
    link.href = `https://status.${location.hostname}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Status page";
    tip.appendChild(link);

    tip.addEventListener("mouseenter", cancelHide);
    tip.addEventListener("mouseleave", scheduleHide);

    const rect = anchor.getBoundingClientRect();
    tip.style.top = `${Math.round(rect.bottom + 6)}px`;
    tip.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.right - 100))}px`;
    return tip;
}

function showTip(anchor: HTMLElement, pinned: boolean): void {
    removeTip();
    tipEl = buildTip(anchor);
    tipPinned = pinned;
    document.body.appendChild(tipEl);
}

function render(state: BannerState): void {
    currentState = state;
    const existing = document.getElementById("status-indicator");
    if (state.mode === "hidden") {
        existing?.remove();
        removeTip();
        return;
    }
    if (existing) {
        if (tipEl && !tipPinned) {
            const anchor = existing;
            showTip(anchor, false);
        }
        return;
    }
    const host = document.querySelector(".site-nav-right");
    if (!host) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "status-indicator";
    btn.className = "status-indicator";
    btn.setAttribute("aria-label", "Service status");
    btn.innerHTML = WARNING_ICON;
    btn.addEventListener("mouseenter", () => {
        if (!tipEl) showTip(btn, false);
        else cancelHide();
    });
    btn.addEventListener("mouseleave", scheduleHide);
    btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (tipEl && tipPinned) removeTip();
        else showTip(btn, true);
    });
    host.insertBefore(btn, host.querySelector(".site-social-btn"));
}

let started = false;

export function initStatusBanner(): void {
    if (started) return;
    started = true;
    document.addEventListener("click", (ev) => {
        if (!tipPinned || !tipEl) return;
        if (ev.target instanceof Node && tipEl.contains(ev.target)) return;
        removeTip();
    });
    let state = INITIAL_BANNER_STATE;
    const tick = async (): Promise<void> => {
        if (document.visibilityState === "hidden") return;
        state = nextBannerState(state, await fetchOutcome());
        render(state);
    };
    void tick();
    window.setInterval(() => { void tick(); }, POLL_MS);
}
