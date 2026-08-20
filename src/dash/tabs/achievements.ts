import { $ } from "../dom.ts";
import { authFetch } from "../session.ts";
import {
    ACHIEVEMENT_CATEGORY,
    ACHIEVEMENT_CATEGORY_LABELS,
    ACHIEVEMENT_CATEGORY_ORDER,
    ACHIEVEMENT_NAMES,
    KNOWN_ACHIEVEMENT_KEYS,
    type AchievementKey,
} from "../../achievements/achievement-catalog.ts";
import { achievementMedallionSvg, lockedAchievementMedallionSvg } from "../../achievements/achievement-medallion.ts";
import { toRomanNumeral } from "../../achievements/achievements-decision.ts";
import { achievementDisplay, sortAchievementEntries, type AchievementEntry } from "../achievements-view.ts";

const MEDALLION_SIZE = 48;
const EMPTY_STATE_MESSAGE = "Achievements are being prepared.";

let active = false;
let activationGeneration = 0;

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function normalizeEntry(raw: unknown): AchievementEntry | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const key = item["key"];
    if (typeof key !== "string" || !KNOWN_ACHIEVEMENT_KEYS.has(key)) return null;
    const tier = item["tier"];
    if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 0) return null;
    const current = item["current"];
    if (typeof current !== "number" || !Number.isFinite(current)) return null;
    const next = item["next"];
    if (next !== null && (typeof next !== "number" || !Number.isFinite(next))) return null;
    return { key: key as AchievementKey, tier, current, next };
}

function normalizeEntries(raw: unknown): AchievementEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: AchievementEntry[] = [];
    for (const item of raw) {
        const entry = normalizeEntry(item);
        if (entry) out.push(entry);
    }
    return out;
}

function buildMedallion(entry: AchievementEntry): string {
    return entry.tier >= 1
        ? achievementMedallionSvg(entry.key, entry.tier, MEDALLION_SIZE)
        : lockedAchievementMedallionSvg(entry.key, MEDALLION_SIZE);
}

function buildCard(entry: AchievementEntry): HTMLElement {
    const card = document.createElement("div");
    card.className = "ach-card" + (entry.tier >= 1 ? " unlocked" : " locked");
    const medallion = document.createElement("div");
    medallion.className = "ach-card-medallion";
    medallion.innerHTML = buildMedallion(entry);
    card.appendChild(medallion);

    const name = document.createElement("div");
    name.className = "ach-card-name";
    name.textContent = ACHIEVEMENT_NAMES[entry.key];
    card.appendChild(name);

    if (entry.tier >= 2) {
        const tier = document.createElement("div");
        tier.className = "ach-card-tier";
        tier.textContent = toRomanNumeral(entry.tier);
        card.appendChild(tier);
    }

    const display = achievementDisplay(entry);
    if (display.kind === "bar") {
        const bar = document.createElement("div");
        bar.className = "ach-bar";
        const fill = document.createElement("div");
        fill.className = "ach-bar-fill";
        fill.style.width = `${display.ratio * 100}%`;
        bar.appendChild(fill);
        card.appendChild(bar);
        const label = document.createElement("div");
        label.className = "ach-bar-label";
        label.textContent = display.label;
        card.appendChild(label);
    } else if (display.kind === "maxed") {
        const bar = document.createElement("div");
        bar.className = "ach-bar";
        const fill = document.createElement("div");
        fill.className = "ach-bar-fill";
        fill.style.width = "100%";
        bar.appendChild(fill);
        card.appendChild(bar);
        const label = document.createElement("div");
        label.className = "ach-state ach-state-max";
        label.textContent = "Max";
        card.appendChild(label);
    } else if (display.kind === "done") {
        const label = document.createElement("div");
        label.className = "ach-state ach-state-done";
        label.textContent = "Done";
        card.appendChild(label);
    } else {
        const label = document.createElement("div");
        label.className = "ach-state ach-state-pending";
        label.textContent = "Not yet";
        card.appendChild(label);
    }

    return card;
}

function renderSections(entries: AchievementEntry[]): HTMLElement {
    const wrap = document.createElement("div");
    for (const category of ACHIEVEMENT_CATEGORY_ORDER) {
        const inCategory = sortAchievementEntries(entries.filter(entry => ACHIEVEMENT_CATEGORY[entry.key] === category));
        if (!inCategory.length) continue;
        const section = document.createElement("div");
        section.className = "ach-section";
        const heading = document.createElement("div");
        heading.className = "grid-heading";
        heading.textContent = ACHIEVEMENT_CATEGORY_LABELS[category];
        section.appendChild(heading);
        const grid = document.createElement("div");
        grid.className = "ach-grid";
        for (const entry of inCategory) grid.appendChild(buildCard(entry));
        section.appendChild(grid);
        wrap.appendChild(section);
    }
    return wrap;
}

function showEmpty(): void {
    $("ach-summary").textContent = "";
    $("ach-sections").replaceChildren();
    const empty = $("ach-empty");
    empty.hidden = false;
    empty.textContent = EMPTY_STATE_MESSAGE;
}

function renderAchievements(entries: AchievementEntry[]): void {
    if (!entries.length) {
        showEmpty();
        return;
    }
    const summary = $("ach-summary");
    const empty = $("ach-empty");
    const sections = $("ach-sections");
    empty.hidden = true;
    const unlocked = entries.filter(entry => entry.tier >= 1).length;
    summary.textContent = `${unlocked} of ${entries.length} unlocked`;
    sections.replaceChildren(renderSections(entries));
}

async function loadAchievements(generation: number): Promise<void> {
    try {
        const raw = await authFetch<unknown>("/api/achievements/me");
        if (!isCurrentActivation(generation)) return;
        renderAchievements(normalizeEntries(raw));
    } catch {
        if (!isCurrentActivation(generation)) return;
        showEmpty();
    }
}

export function init(): void {}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    void loadAchievements(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
}
