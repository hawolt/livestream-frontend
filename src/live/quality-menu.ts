import { qualityBtn, qualityPopupEl, qualitySelectEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { qualityLabel, resolveNextQuality } from "../quality.ts";
import { QUALITY_STORAGE_KEY } from "./constants.ts";
import { writeLocalStorage } from "../storage.ts";
import { beginTransport } from "./player/lifecycle.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";

export function qualityButtonLabel(): string {
    return qualityLabel(ctx.qualityPreference);
}

export function renderQualityPopupItems(): void {
    qualityPopupEl.replaceChildren();
    const entries: Array<[string, string]> = [];
    for (const name of ctx.qualityLadder) entries.push([name, qualityLabel(name)]);
    for (const [value, label] of entries) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "live-quality-item";
        const active = value === ctx.qualityPreference;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        const checkEl = document.createElement("span");
        checkEl.className = "live-quality-check";
        checkEl.textContent = "✓";
        item.append(labelEl, checkEl);
        item.addEventListener("click", () => selectQuality(value));
        qualityPopupEl.appendChild(item);
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
    const show = ctx.transportKind === "ws" && ctx.qualityLadder.length >= 2;
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
    const next = resolveNextQuality(ctx.qualityPreference, ctx.qualityLadder, ctx.qualityLadderKnown, ctx.activeQuality);
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
