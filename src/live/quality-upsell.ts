import { enterTerminal } from "./player/lifecycle.ts";
import { openLoginModal } from "./login-modal.ts";
import { sessionTokenMetadata } from "../session-token.ts";

let panelWired = false;

function panelEl(): HTMLElement | null {
    return document.getElementById("live-quality-lock");
}

function isSignedIn(): boolean {
    const token = sessionStorage.getItem("dash_token") ?? "";
    return sessionTokenMetadata(token) !== null;
}

function showUpsellPanel(info: string): void {
    const panel = panelEl();
    if (!panel) return;
    const infoEl = document.getElementById("live-quality-lock-info");
    if (infoEl) infoEl.textContent = info;
    if (!panelWired) {
        panelWired = true;
        document.getElementById("live-quality-lock-dismiss")
            ?.addEventListener("click", closeQualityUpsell);
        document.getElementById("live-quality-lock-cta")
            ?.addEventListener("click", (event) => {
                if (isSignedIn()) return;
                event.preventDefault();
                closeQualityUpsell();
                openLoginModal("subscribe");
            });
    }
    panel.hidden = false;
}

export function openQualityUpsell(): void {
    showUpsellPanel("This stream plays at a higher quality");
}

export function closeQualityUpsell(): void {
    const panel = panelEl();
    if (panel) panel.hidden = true;
}

export function enterQualityLockedTerminal(): void {
    enterTerminal("");
    openQualityUpsell();
}
