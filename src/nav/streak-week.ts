export interface StreakDay {
    date: string;
    label: string;
    visited: boolean;
    today: boolean;
    future: boolean;
}

export interface StreakWeek {
    days: StreakDay[];
    visitedThisWeek: number;
    lapsed: boolean;
    visitedToday: boolean;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const FLAME_MIN_PX = 15;
export const FLAME_MAX_PX = 34;
export const FLAME_FULL_STREAK = 30;

const DAY_MS = 86400000;
const EPOCH_WEEKDAY_OFFSET = 3;

function dayNumber(milliseconds: number): number {
    return Math.floor(milliseconds / DAY_MS);
}

function isoDate(day: number): string {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function weekdayIndex(day: number): number {
    return (((day + EPOCH_WEEKDAY_OFFSET) % 7) + 7) % 7;
}

export function streakWeek(streak: number, lastVisitAt: number, now: number): StreakWeek {
    const today = dayNumber(now);
    const weekStart = today - weekdayIndex(today);
    const countedStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
    const lastVisit = Number.isFinite(lastVisitAt) ? Math.min(dayNumber(lastVisitAt), today) : today;
    const firstVisit = lastVisit - countedStreak + 1;
    const days: StreakDay[] = [];
    let visitedThisWeek = 0;
    for (let offset = 0; offset < 7; offset++) {
        const day = weekStart + offset;
        const visited = countedStreak > 0 && day >= firstVisit && day <= lastVisit;
        if (visited) visitedThisWeek += 1;
        days.push({
            date: isoDate(day),
            label: WEEKDAY_LABELS[offset]!,
            visited,
            today: day === today,
            future: day > today,
        });
    }
    return {
        days,
        visitedThisWeek,
        lapsed: countedStreak > 0 && today - lastVisit > 1,
        visitedToday: countedStreak > 0 && lastVisit === today,
    };
}

export function flameSize(streak: number): number {
    if (!Number.isFinite(streak) || streak <= 1) return FLAME_MIN_PX;
    const capped = Math.min(Math.floor(streak), FLAME_FULL_STREAK);
    const span = (capped - 1) / (FLAME_FULL_STREAK - 1);
    return Math.round(FLAME_MIN_PX + (FLAME_MAX_PX - FLAME_MIN_PX) * span);
}
