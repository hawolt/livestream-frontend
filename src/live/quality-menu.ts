import { qualityBtn, qualityPopupEl, qualitySelectEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { qualityRowParts } from "../quality.ts";
import { HLS_QUALITY_STORAGE_KEY } from "./constants.ts";
import { writeLocalStorage } from "../storage.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { hlsAutoEnabled, hlsCurrentLevel, hlsLevelLabel, hlsLevels, setHlsLevel } from "./player/hls.ts";
import { openQualityUpsell } from "./quality-upsell.ts";

export function qualityButtonLabel(): string {
    if (ctx.transportKind === "hls-js") return hlsLevelLabel();
    return "Quality";
}

interface QualityRowSpec {
    label: string;
    active?: boolean;
    locked?: boolean;
    onClick: () => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function padlock(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("live-quality-lock-mini");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
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

function appendQualityRow(spec: QualityRowSpec): void {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "live-quality-item";
    item.classList.toggle("active", spec.active === true);
    item.classList.toggle("locked", spec.locked === true);
    item.setAttribute("aria-pressed", String(spec.active === true));
    const checkEl = document.createElement("span");
    checkEl.className = "live-quality-check";
    checkEl.textContent = "✓";
    item.appendChild(checkEl);
    const parts = qualityRowParts(spec.label);
    const resEl = document.createElement("span");
    resEl.className = "live-quality-res";
    resEl.textContent = parts.res;
    item.appendChild(resEl);
    if (spec.locked) {
        item.appendChild(padlock());
    } else if (parts.fps !== null) {
        const fpsEl = document.createElement("span");
        fpsEl.className = "live-quality-fps";
        fpsEl.textContent = parts.fps;
        item.appendChild(fpsEl);
    }
    item.addEventListener("click", spec.onClick);
    qualityPopupEl.appendChild(item);
}

function selectHlsLevel(index: number): void {
    const entry = hlsLevels().find((e) => e.index === index);
    writeLocalStorage(HLS_QUALITY_STORAGE_KEY, index === -1 || !entry ? "" : entry.label);
    setHlsLevel(index);
    renderQualityMenu();
}

function showLockedRows(): boolean {
    return ctx.lockedQualities.length > 0 && !ctx.terminal && ctx.state !== "offline";
}

export function renderQualityPopupItems(): void {
    qualityPopupEl.replaceChildren();
    if (ctx.transportKind === "hls-js") {
        appendQualityRow({
            label: "Auto",
            active: hlsAutoEnabled(),
            onClick: () => selectHlsLevel(-1),
        });
        for (const entry of hlsLevels()) {
            appendQualityRow({
                label: entry.label,
                active: !hlsAutoEnabled() && hlsCurrentLevel() === entry.index,
                onClick: () => selectHlsLevel(entry.index),
            });
        }
    }
    if (showLockedRows()) {
        for (const label of ctx.lockedQualities) {
            appendQualityRow({
                label,
                locked: true,
                onClick: () => {
                    closeQualityPopup(true);
                    openQualityUpsell();
                },
            });
        }
    }
}

function onOutsideQualityClick(ev: MouseEvent): void {
    if (qualitySelectEl.contains(ev.target as Node)) return;
    closeQualityPopup();
}

function closeQualityPopup(restoreFocus = false): void {
    if (qualityPopupEl.hidden) return;
    qualityPopupEl.hidden = true;
    qualityBtn.setAttribute("aria-expanded", "false");
    closeDismissibleSurface(qualityPopupEl);
    document.removeEventListener("mousedown", onOutsideQualityClick, true);
    if (restoreFocus && qualityBtn.isConnected) qualityBtn.focus();
}

function toggleQualityPopup(): void {
    if (!qualityPopupEl.hidden) {
        closeQualityPopup();
        return;
    }
    renderQualityPopupItems();
    qualityPopupEl.hidden = false;
    qualityBtn.setAttribute("aria-expanded", "true");
    openDismissibleSurface(qualityPopupEl, () => closeQualityPopup(true));
    document.addEventListener("mousedown", onOutsideQualityClick, true);
}

export function renderQualityMenu(): void {
    const show = ctx.transportKind === "hls-js" || showLockedRows();
    qualitySelectEl.hidden = !show;
    if (!show) {
        closeQualityPopup();
        return;
    }
    qualityBtn.textContent = qualityButtonLabel();
    if (!qualityPopupEl.hidden) renderQualityPopupItems();
}

export function wireQualityMenu(): void {
    qualityBtn.removeAttribute("aria-haspopup");
    qualityBtn.setAttribute("aria-expanded", "false");
    qualityBtn.setAttribute("aria-controls", qualityPopupEl.id);
    qualityPopupEl.setAttribute("role", "group");
    qualityPopupEl.setAttribute("aria-label", "Video quality");
    qualityBtn.addEventListener("click", toggleQualityPopup);
}
