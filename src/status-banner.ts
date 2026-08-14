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
const DISMISS_KEY = "status_banner_dismissed";

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

function render(state: BannerState): void {
    const message = bannerMessage(state);
    const existing = document.getElementById("status-banner");
    if (!message || sessionStorage.getItem(DISMISS_KEY) === bannerSignature(state)) {
        existing?.remove();
        return;
    }
    const bar = existing ?? document.createElement("div");
    bar.id = "status-banner";
    bar.className = "status-banner";
    bar.replaceChildren();

    const text = document.createElement("span");
    text.className = "status-banner-text";
    text.textContent = message;
    bar.appendChild(text);

    const link = document.createElement("a");
    link.className = "status-banner-link";
    link.href = `https://status.${location.hostname}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Status page";
    bar.appendChild(link);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "status-banner-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => {
        sessionStorage.setItem(DISMISS_KEY, bannerSignature(state));
        bar.remove();
    });
    bar.appendChild(dismiss);

    if (!existing) document.body.appendChild(bar);
}

let started = false;

export function initStatusBanner(): void {
    if (started) return;
    started = true;
    let state = INITIAL_BANNER_STATE;
    const tick = async (): Promise<void> => {
        if (document.visibilityState === "hidden") return;
        state = nextBannerState(state, await fetchOutcome());
        render(state);
    };
    void tick();
    window.setInterval(() => { void tick(); }, POLL_MS);
}
