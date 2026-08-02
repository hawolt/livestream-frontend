import { browseIframeEl, browseMiniClose, browseMiniReturn } from "./dom.ts";
import { ctx, nextGen } from "./player/context.ts";
import { EXPLORE_TITLE } from "./constants.ts";
import { markActive } from "../nav.ts";
import { isPopoutMode, scheduleFullscreenSettle } from "./layout.ts";
import { syncChannelRailVisibility } from "./channel-rail.ts";
import { exitCinemaMode, isCinemaMode } from "./cinema.ts";
import { clearRetryTimer, fullTeardown, goOffline, resetRetryBackoff, setState } from "./player/lifecycle.ts";
import { stopHealthTimer } from "./player/health.ts";
import { resetStreamInfo } from "./stream-info.ts";

let browseMode = false;
let browseMiniClosed = false;
let miniParked = false;

const RAIL_WIDTH_MESSAGE_TYPE = "itzon:rail-width";

window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    const data = e.data as { type?: unknown; width?: unknown } | null;
    if (!data || data.type !== RAIL_WIDTH_MESSAGE_TYPE) return;
    const width = typeof data.width === "number" && Number.isFinite(data.width)
        ? Math.max(0, Math.min(600, Math.round(data.width)))
        : 0;
    document.documentElement.style.setProperty("--browse-rail-width", `${width}px`);
});

export function isBrowseMode(): boolean {
    return browseMode;
}

export function canEnterBrowseMode(): boolean {
    return !ctx.terminal && ctx.state !== "offline" && !isPopoutMode();
}

export function applyBrowseMode(on: boolean, opts: { push?: boolean } = {}): void {
    const push = opts.push !== false;
    if (on) {
        if (browseMode) return;
        if (isCinemaMode()) exitCinemaMode();
        browseMode = true;
        browseMiniClosed = false;
        if (!browseIframeEl.src) browseIframeEl.src = "/?framed=1";
        browseIframeEl.hidden = false;
        Object.assign(browseIframeEl.style, {
            display: "block",
            position: "fixed",
            top: "52px",
            left: "0",
            right: "0",
            bottom: "0",
            width: "100%",
            height: "calc(100dvh - 52px)",
            border: "0",
            zIndex: "30",
            background: "var(--bg)",
        });
        if (push) history.pushState({ liveBrowse: true }, "", "/");
        document.title = EXPLORE_TITLE;
        document.body.classList.add("browse-mode");
        document.body.classList.remove("browse-mini-closed");
        markActive("browse");
    } else {
        if (!browseMode) return;
        browseMode = false;
        browseMiniClosed = false;
        browseIframeEl.hidden = true;
        browseIframeEl.style.display = "none";
        document.body.classList.remove("browse-mode", "browse-mini-closed");
        markActive(null);
        document.title = ctx.username;
        if (push) history.pushState({ liveChannel: true }, "", `/${encodeURIComponent(ctx.username)}`);
        if (miniParked) {
            miniParked = false;
            resetRetryBackoff();
            goOffline(ctx.gen);
        }
    }
    syncChannelRailVisibility();
    scheduleFullscreenSettle();
}

export function closeBrowseMini(): void {
    if (!browseMode || browseMiniClosed) return;
    browseMiniClosed = true;
    document.body.classList.add("browse-mini-closed");
    miniParked = true;
    clearRetryTimer();
    stopHealthTimer();
    nextGen();
    fullTeardown();
    resetStreamInfo();
    setState("offline");
}

export function wireBrowseMode(): void {
    if (isPopoutMode()) return;
    const brand = document.querySelector<HTMLAnchorElement>(".site-brand");
    const browseLink = document.querySelector<HTMLAnchorElement>('[data-nav="browse"]');
    const onNavClick = (ev: MouseEvent) => {
        if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        if (isPopoutMode() || !canEnterBrowseMode()) return;
        ev.preventDefault();
        applyBrowseMode(true);
    };
    brand?.addEventListener("click", onNavClick);
    browseLink?.addEventListener("click", onNavClick);

    browseMiniReturn.addEventListener("click", () => applyBrowseMode(false));
    browseMiniClose.addEventListener("click", closeBrowseMini);

    window.addEventListener("popstate", (ev) => {
        if (isPopoutMode()) return;
        const st = ev.state as { liveBrowse?: boolean; liveChannel?: boolean } | null;
        const wantBrowse = st ? !!st.liveBrowse : location.pathname === "/";
        applyBrowseMode(wantBrowse, { push: false });
    });
}
