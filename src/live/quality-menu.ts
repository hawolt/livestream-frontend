import { qualityBtn, qualityPopupEl, qualitySelectEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { allowedSubset, qualityLabel, resolveNextQuality } from "../quality.ts";
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

function appendUpsellRow(): void {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "live-quality-item locked";
    const labelEl = document.createElement("span");
    labelEl.textContent = "Low latency";
    item.appendChild(labelEl);
    item.appendChild(qualityPadlock());
    item.addEventListener("click", () => openLowLatencyUpsell());
    qualityPopupEl.appendChild(item);
}

function appendHlsAutoItem(): void {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "live-quality-item";
    const active = hlsAutoEnabled();
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
    const labelEl = document.createElement("span");
    labelEl.textContent = "Auto";
    item.appendChild(labelEl);
    const checkEl = document.createElement("span");
    checkEl.className = "live-quality-check";
    checkEl.textContent = "✓";
    item.appendChild(checkEl);
    item.addEventListener("click", () => selectHlsLevel(-1));
    qualityPopupEl.appendChild(item);
}

function appendHlsLevelItem(entry: { index: number; label: string }): void {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "live-quality-item";
    const active = !hlsAutoEnabled() && hlsCurrentLevel() === entry.index;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
    const labelEl = document.createElement("span");
    labelEl.textContent = entry.label;
    item.appendChild(labelEl);
    const checkEl = document.createElement("span");
    checkEl.className = "live-quality-check";
    checkEl.textContent = "✓";
    item.appendChild(checkEl);
    item.addEventListener("click", () => selectHlsLevel(entry.index));
    qualityPopupEl.appendChild(item);
}

function selectHlsLevel(index: number): void {
    setHlsLevel(index);
    renderQualityMenu();
}

export function renderQualityPopupItems(): void {
    qualityPopupEl.replaceChildren();
    if (ctx.transportKind === "ws") {
        const entries: Array<[string, string]> = [];
        for (const name of ctx.qualityLadder) entries.push([name, qualityLabel(name)]);
        for (const [value, label] of entries) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "live-quality-item";
            const locked = ctx.lockedQualities.includes(value);
            const active = !locked && value === ctx.qualityPreference;
            item.classList.toggle("active", active);
            item.classList.toggle("locked", locked);
            item.setAttribute("aria-pressed", String(active));
            const labelEl = document.createElement("span");
            labelEl.textContent = label;
            item.appendChild(labelEl);
            if (locked) {
                item.appendChild(qualityPadlock());
                item.addEventListener("click", () => openQualityUpsell());
            } else {
                const checkEl = document.createElement("span");
                checkEl.className = "live-quality-check";
                checkEl.textContent = "✓";
                item.appendChild(checkEl);
                item.addEventListener("click", () => selectQuality(value));
            }
            qualityPopupEl.appendChild(item);
        }
    } else if (ctx.transportKind === "hls-js") {
        appendHlsAutoItem();
        for (const entry of hlsLevels()) appendHlsLevelItem(entry);
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
