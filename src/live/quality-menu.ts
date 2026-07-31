import { qualityBtn, qualityPopupEl, qualitySelectEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { QUALITY_AUTO, qualityLabel, resolveNextQuality } from "../quality.ts";
import { QUALITY_STORAGE_KEY } from "./constants.ts";
import { writeLocalStorage } from "../storage.ts";
import { resetAbr } from "./player/abr.ts";
import { beginTransport } from "./player/lifecycle.ts";

export function qualityButtonLabel(): string {
    if (ctx.qualityPreference === QUALITY_AUTO) {
        return ctx.qualityLadder.length ? `Auto · ${qualityLabel(ctx.activeQuality)}` : "Auto";
    }
    return qualityLabel(ctx.qualityPreference);
}

export function renderQualityPopupItems(): void {
    qualityPopupEl.replaceChildren();
    const entries: Array<[string, string]> = [[QUALITY_AUTO, "Auto"]];
    for (const name of ctx.qualityLadder) entries.push([name, qualityLabel(name)]);
    for (const [value, label] of entries) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "live-quality-item";
        item.setAttribute("role", "menuitemradio");
        const active = value === ctx.qualityPreference;
        item.classList.toggle("active", active);
        item.setAttribute("aria-checked", String(active));
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

function onQualityKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") closeQualityPopup();
}

function closeQualityPopup(): void {
    if (qualityPopupEl.hidden) return;
    qualityPopupEl.hidden = true;
    qualityBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onOutsideQualityClick, true);
    document.removeEventListener("keydown", onQualityKeydown, true);
}

function toggleQualityPopup(): void {
    if (!qualityPopupEl.hidden) {
        closeQualityPopup();
        return;
    }
    renderQualityPopupItems();
    qualityPopupEl.hidden = false;
    qualityBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", onOutsideQualityClick, true);
    document.addEventListener("keydown", onQualityKeydown, true);
}

export function renderQualityMenu(): void {
    const show = ctx.qualityLadder.length >= 2;
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
    closeQualityPopup();
    if (pref === ctx.qualityPreference) return;
    ctx.qualityPreference = pref;
    writeLocalStorage(QUALITY_STORAGE_KEY, ctx.qualityPreference);
    resetAbr();
    renderQualityMenu();
    if (ctx.transportKind !== "ws" || ctx.terminal || ctx.state === "offline") return;
    const next = resolveNextQuality(ctx.qualityPreference, ctx.qualityLadder, ctx.qualityLadderKnown, ctx.activeQuality);
    if (next === ctx.requestedQuality) return;
    beginTransport();
}

export function wireQualityMenu(): void {
    qualityBtn.addEventListener("click", toggleQualityPopup);
}
