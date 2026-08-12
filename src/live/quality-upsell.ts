import { ctx } from "./player/context.ts";
import { enterTerminal } from "./player/lifecycle.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function padlockSvg(size: number): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
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

export function qualityPadlock(): SVGSVGElement {
    const svg = padlockSvg(12);
    svg.classList.add("live-quality-lock");
    return svg;
}

function upsellText(): string {
    const label = ctx.lockedStreamLabel || "high quality";
    return `This stream plays at ${label}. Watching above 1080p60 needs a subscription: `
        + "Baron unlocks up to 1440p and 120fps, King unlocks everything up to 4K and 240fps.";
}

let modal: HTMLDivElement | null = null;

function buildModal(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "login-modal quality-upsell";
    wrap.hidden = true;
    const box = document.createElement("div");
    box.className = "login-modal-box";
    const icon = document.createElement("div");
    icon.className = "quality-upsell-lock";
    icon.appendChild(padlockSvg(28));
    const title = document.createElement("h3");
    title.textContent = "Subscribe to watch";
    const text = document.createElement("p");
    text.className = "quality-upsell-text";
    const go = document.createElement("a");
    go.className = "login-modal-submit";
    go.href = "/dashboard/subscription";
    go.textContent = "View subscriptions";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "quality-upsell-dismiss";
    dismiss.textContent = "Not now";
    dismiss.addEventListener("click", closeQualityUpsell);
    box.append(icon, title, text, go, dismiss);
    wrap.appendChild(box);
    wrap.addEventListener("click", (ev) => {
        if (ev.target === wrap) closeQualityUpsell();
    });
    document.body.appendChild(wrap);
    return wrap;
}

export function openQualityUpsell(): void {
    if (!modal) modal = buildModal();
    const text = modal.querySelector<HTMLParagraphElement>(".quality-upsell-text");
    if (text) text.textContent = upsellText();
    modal.hidden = false;
}

export function closeQualityUpsell(): void {
    if (modal) modal.hidden = true;
}

export function enterQualityLockedTerminal(): void {
    enterTerminal(`This stream plays at ${ctx.lockedStreamLabel || "high quality"} - subscribe to watch`);
    openQualityUpsell();
}
