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

export type BannerSurface = "mobile" | "chat" | "nav" | "float";

export function bannerSurfaceFor(viewportWidth: number, hasChat: boolean, hasNav: boolean): BannerSurface {
    if (viewportWidth <= 840) return "mobile";
    if (hasChat) return "chat";
    if (hasNav && viewportWidth > 1100) return "nav";
    return "float";
}

const WARNING_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

function bannerMount(surface: BannerSurface): { host: Element; cls: string } {
    if (surface === "chat") {
        const head = document.querySelector(".live-chat-head");
        if (head && head.parentElement) return { host: head.parentElement, cls: "status-banner status-banner-chat" };
    }
    if (surface === "nav") {
        const social = document.querySelector(".site-nav-right");
        if (social) return { host: social, cls: "status-banner status-banner-nav" };
    }
    if (surface === "mobile") return { host: document.body, cls: "status-banner status-banner-mobile" };
    return { host: document.body, cls: "status-banner" };
}

function render(state: BannerState): void {
    const message = bannerMessage(state);
    document.getElementById("status-banner")?.remove();
    if (!message || sessionStorage.getItem(DISMISS_KEY) === bannerSignature(state)) return;

    const chatHead = document.querySelector(".live-chat-head");
    const hasChat = chatHead !== null && !document.body.classList.contains("chat-popout")
        && !document.body.classList.contains("chat-collapsed");
    const hasNav = document.querySelector(".site-nav-right .site-social-btn") !== null;
    const surface = bannerSurfaceFor(window.innerWidth, hasChat, hasNav);
    const mount = bannerMount(surface);

    const bar = document.createElement("div");
    bar.id = "status-banner";
    bar.className = mount.cls;

    const icon = document.createElement("span");
    icon.className = "status-banner-icon";
    icon.innerHTML = WARNING_ICON;
    bar.appendChild(icon);

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

    if (surface === "chat" && chatHead) chatHead.insertAdjacentElement("afterend", bar);
    else if (surface === "nav") mount.host.insertBefore(bar, mount.host.querySelector(".site-social-btn"));
    else mount.host.appendChild(bar);
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
