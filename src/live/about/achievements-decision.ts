const TIER_RING_COLORS: Record<number, string> = {
    1: "#b45309",
    2: "#94a3b8",
    3: "#fbbf24",
    4: "#34d399",
    5: "#60a5fa",
    6: "#a78bfa",
};
const TIER_RING_COLOR_MAX = "#e8edf4";

export function tierRingColor(tier: number): string {
    const t = Math.floor(tier);
    if (t >= 7) return TIER_RING_COLOR_MAX;
    return TIER_RING_COLORS[t] ?? TIER_RING_COLORS[1]!;
}

const ROMAN_VALUES: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRomanNumeral(value: number): string {
    let n = Math.max(1, Math.floor(value));
    let out = "";
    for (const [amount, numeral] of ROMAN_VALUES) {
        while (n >= amount) {
            out += numeral;
            n -= amount;
        }
    }
    return out;
}

export interface AchievementCap<T> {
    visible: T[];
    overflow: T[];
}

export function capAchievements<T>(items: T[], cap: number): AchievementCap<T> {
    if (cap < 0 || items.length <= cap) return { visible: items, overflow: [] };
    return { visible: items.slice(0, cap), overflow: items.slice(cap) };
}
