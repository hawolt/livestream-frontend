import { ctx } from "./player/context.ts";
import { enterTerminal } from "./player/lifecycle.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

export function qualityPadlock(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("live-quality-lock-mini");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", "4");
    body.setAttribute("y", "11");
    body.setAttribute("width", "16");
    body.setAttribute("height", "10");
    body.setAttribute("rx", "2");
    const shackle = document.createElementNS(SVG_NS, "path");
    shackle.setAttribute("d", "M8 11V7a4 4 0 0 1 8 0v4");
    svg.append(body, shackle);
    return svg;
}

let dismissWired = false;

function panelEl(): HTMLElement | null {
    return document.getElementById("live-quality-lock");
}

export function openQualityUpsell(): void {
    const panel = panelEl();
    if (!panel) return;
    const info = document.getElementById("live-quality-lock-info");
    if (info) {
        info.textContent = `This stream plays at ${ctx.lockedStreamLabel || "a higher quality"}. `
            + "Baron unlocks up to 1440p and 120 FPS, King unlocks everything.";
    }
    if (!dismissWired) {
        dismissWired = true;
        document.getElementById("live-quality-lock-dismiss")
            ?.addEventListener("click", closeQualityUpsell);
    }
    panel.hidden = false;
}

export function closeQualityUpsell(): void {
    const panel = panelEl();
    if (panel) panel.hidden = true;
}

export function enterQualityLockedTerminal(): void {
    enterTerminal(`This stream plays at ${ctx.lockedStreamLabel || "a higher quality"} - subscribe to watch`);
    openQualityUpsell();
}
