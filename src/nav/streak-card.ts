import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { flameSize, streakWeek, type StreakWeek } from "./streak-week.ts";

const FLAME_PATH = `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`;

const CHECK_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

const CHIP_FLAME_PX = 15;

let streakCardCount = 0;
let updateStreakChip: ((streak: number) => void) | null = null;

function flameIcon(size: number): string {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FLAME_PATH}</svg>`;
}

function streakNote(week: StreakWeek): string {
    if (week.visitedToday) return "Come back tomorrow to keep it going";
    if (week.lapsed) return "The streak ended, visit today to start a new one";
    return "Visit today to keep it going";
}

function buildWeekGrid(week: StreakWeek): HTMLElement {
    const list = document.createElement("ul");
    list.className = "site-streak-week";
    for (const day of week.days) {
        const item = document.createElement("li");
        item.className = "site-streak-day";
        item.classList.toggle("visited", day.visited);
        item.classList.toggle("today", day.today);
        item.classList.toggle("future", day.future);
        item.setAttribute("aria-label", `${day.label} ${day.date}, ${day.visited ? "visited" : "not visited"}`);

        const box = document.createElement("span");
        box.className = "site-streak-box";
        box.setAttribute("aria-hidden", "true");
        if (day.visited) box.innerHTML = CHECK_ICON;

        const label = document.createElement("span");
        label.className = "site-streak-dow";
        label.textContent = day.label;

        item.append(box, label);
        list.appendChild(item);
    }
    return list;
}

function buildStreakChip(streak: number): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "site-streak";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-streak-btn";

    const flame = document.createElement("span");
    flame.className = "site-streak-flame";
    const count = document.createElement("span");
    count.className = "site-streak-count";
    btn.append(flame, count);

    const card = document.createElement("div");
    card.className = "site-streak-card";
    card.hidden = true;
    streakCardCount += 1;
    card.id = `site-streak-card-${streakCardCount}`;
    btn.setAttribute("aria-controls", card.id);
    btn.setAttribute("aria-expanded", "false");

    const head = document.createElement("div");
    head.className = "site-streak-card-head";
    const cardFlame = document.createElement("span");
    cardFlame.className = "site-streak-card-flame";
    const headText = document.createElement("span");
    headText.className = "site-streak-card-title";
    head.append(cardFlame, headText);

    const note = document.createElement("p");
    note.className = "site-streak-card-note";

    const grid = document.createElement("div");
    grid.className = "site-streak-card-grid";

    card.append(head, grid, note);
    wrap.append(btn, card);

    function sync(streakDays: number): void {
        const now = Date.now();
        const week = streakWeek(streakDays, now, now);
        flame.innerHTML = flameIcon(CHIP_FLAME_PX);
        cardFlame.innerHTML = flameIcon(flameSize(streakDays));
        count.textContent = String(streakDays);
        headText.textContent = `${streakDays} day${streakDays === 1 ? "" : "s"} in a row`;
        note.textContent = streakNote(week);
        btn.setAttribute("aria-label", `${streakDays}-day visit streak`);
        grid.replaceChildren(buildWeekGrid(week));
    }

    function onOutsideMouseDown(event: MouseEvent): void {
        if (wrap.contains(event.target as Node)) return;
        closeCard();
    }

    function openCard(): void {
        if (!card.hidden) return;
        card.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        openDismissibleSurface(card, closeCard);
        document.addEventListener("mousedown", onOutsideMouseDown, true);
    }

    function closeCard(): void {
        if (card.hidden) return;
        card.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        closeDismissibleSurface(card);
        document.removeEventListener("mousedown", onOutsideMouseDown, true);
    }

    let openBeforePointerDown = false;
    btn.addEventListener("mousedown", () => { openBeforePointerDown = !card.hidden; });
    btn.addEventListener("click", () => {
        if (openBeforePointerDown) closeCard();
        else openCard();
    });
    wrap.addEventListener("mouseenter", openCard);
    wrap.addEventListener("mouseleave", () => {
        if (wrap.contains(document.activeElement)) return;
        closeCard();
    });
    wrap.addEventListener("focusin", openCard);
    wrap.addEventListener("focusout", (event) => {
        if (wrap.contains(event.relatedTarget as Node)) return;
        closeCard();
    });

    sync(streak);
    updateStreakChip = sync;
    return wrap;
}

export function renderStreak(streak: number | undefined): void {
    const existing = document.querySelector<HTMLElement>(".site-streak");
    if (typeof streak !== "number" || streak < 1) {
        existing?.remove();
        updateStreakChip = null;
        return;
    }
    if (existing && updateStreakChip) {
        updateStreakChip(streak);
        return;
    }
    const more = document.querySelector<HTMLElement>(".site-more");
    if (!more) return;
    existing?.remove();
    more.after(buildStreakChip(streak));
}
