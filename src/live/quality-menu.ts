import { qualityBtn, qualityPopupEl, qualitySelectEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { allowedSubset, qualityLabel, qualityRowParts, resolveNextQuality } from "../quality.ts";
import { openLowLatencyUpsell, openQualityUpsell, qualityPadlock } from "./quality-upsell.ts";
import { QUALITY_STORAGE_KEY } from "./constants.ts";
import { writeLocalStorage } from "../storage.ts";
import { beginTransport } from "./player/lifecycle.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { hlsAutoEnabled, hlsCurrentLevel, hlsLevelLabel, hlsLevels, setHlsLevel } from "./player/hls.ts";

function showLowLatencyUpsellRow(): boolean {
    return (ctx.transportKind === "hls-native" || ctx.transportKind === "hls-js")
        && !ctx.terminal
        && ctx.state !== "offline";
}

export function qualityButtonLabel(): string {
    if (ctx.transportKind === "ws") return qualityLabel(ctx.qualityPreference);
    if (ctx.transportKind === "hls-js") return hlsLevelLabel();
    return "Quality";
}

interface QualityRowSpec {
    label: string;
    active?: boolean;
    locked?: boolean;
    onClick: () => void;
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
        item.appendChild(qualityPadlock());
    } else if (parts.fps !== null) {
        const fpsEl = document.createElement("span");
        fpsEl.className = "live-quality-fps";
        fpsEl.textContent = parts.fps;
        item.appendChild(fpsEl);
    }
    item.addEventListener("click", spec.onClick);
    qualityPopupEl.appendChild(item);
}

function appendUpsellRow(): void {
    appendQualityRow({
        label: "Low latency",
        locked: true,
        onClick: () => {
            closeQualityPopup();
            openLowLatencyUpsell();
        },
    });
}

function selectHlsLevel(index: number): void {
    setHlsLevel(index);
    renderQualityMenu();
}

export function renderQualityPopupItems(): void {
    qualityPopupEl.replaceChildren();
    if (ctx.transportKind === "ws") {
        for (const name of ctx.qualityLadder) {
            const locked = ctx.lockedQualities.includes(name);
            appendQualityRow({
                label: qualityLabel(name),
                locked,
                active: !locked && name === ctx.qualityPreference,
                onClick: locked
                    ? () => {
                        closeQualityPopup();
                        openQualityUpsell();
                    }
                    : () => selectQuality(name),
            });
        }
    } else if (ctx.transportKind === "hls-js") {
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
    if (showLowLatencyUpsellRow()) appendUpsellRow();
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
    const wsShow = ctx.transportKind === "ws" && ctx.qualityLadder.length >= 2;
    const hlsJsShow = ctx.transportKind === "hls-js";
    const show = wsShow || hlsJsShow || showLowLatencyUpsellRow();
    qualitySelectEl.hidden = !show;
    if (!show) {
        closeQualityPopup();
        return;
    }
    qualityBtn.textContent = qualityButtonLabel();
    if (!qualityPopupEl.hidden) renderQualityPopupItems();
}

export function applyQualityList(list: string[]): boolean {
    ctx.qualityLadder = list;
    ctx.qualityLadderKnown = true;
    renderQualityMenu();
    if (ctx.transportKind !== "ws" || ctx.terminal || ctx.state === "offline") return false;
    const next = resolveNextQuality(ctx.qualityPreference,
        allowedSubset(ctx.qualityLadder, ctx.lockedQualities), ctx.qualityLadderKnown, ctx.activeQuality);
    if (next === ctx.requestedQuality) return false;
    beginTransport();
    return true;
}

export function selectQuality(pref: string): void {
    closeQualityPopup(true);
    if (pref === ctx.qualityPreference) return;
    ctx.qualityPreference = pref;
    writeLocalStorage(QUALITY_STORAGE_KEY, ctx.qualityPreference);
    renderQualityMenu();
    if (ctx.transportKind !== "ws" || ctx.terminal || ctx.state === "offline") return;
    const next = resolveNextQuality(ctx.qualityPreference, ctx.qualityLadder, ctx.qualityLadderKnown, ctx.activeQuality);
    if (next === ctx.requestedQuality) return;
    beginTransport();
}

export function wireQualityMenu(): void {
    qualityBtn.removeAttribute("aria-haspopup");
    qualityBtn.setAttribute("aria-expanded", "false");
    qualityBtn.setAttribute("aria-controls", qualityPopupEl.id);
    qualityPopupEl.setAttribute("role", "group");
    qualityPopupEl.setAttribute("aria-label", "Video quality");
    qualityBtn.addEventListener("click", toggleQualityPopup);
}
