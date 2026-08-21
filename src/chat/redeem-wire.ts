export const MAX_REDEEM_TEXT = 400;

export interface ViewerReward {
    id: number;
    kind: "custom" | "highlight";
    title: string;
    cost: number;
    enabled: boolean;
    requiresText: boolean;
}

export interface ArmedHighlight {
    rewardId: number;
    title: string;
    cost: number;
}

export function parseViewerRewards(payload: unknown): ViewerReward[] {
    const list = (payload as { rewards?: unknown } | null)?.rewards;
    if (!Array.isArray(list)) return [];
    const out: ViewerReward[] = [];
    for (const entry of list) {
        const raw = entry as { id?: unknown; kind?: unknown; title?: unknown; cost?: unknown; enabled?: unknown; requiresText?: unknown } | null;
        if (!raw) continue;
        if (typeof raw.id !== "number" || !Number.isInteger(raw.id)) continue;
        if (typeof raw.title !== "string" || raw.title === "") continue;
        if (typeof raw.cost !== "number" || !Number.isFinite(raw.cost) || raw.cost < 0) continue;
        if (raw.enabled === false) continue;
        const kind = raw.kind === "highlight" ? "highlight" : "custom";
        out.push({
            id: raw.id,
            kind,
            title: raw.title,
            cost: raw.cost,
            enabled: true,
            requiresText: kind === "highlight" || raw.requiresText === true,
        });
    }
    return out;
}

export function armHighlight(reward: ViewerReward): ArmedHighlight | null {
    if (reward.kind !== "highlight") return null;
    return { rewardId: reward.id, title: reward.title, cost: reward.cost };
}

export function redeemText(raw: string): string | null {
    const text = raw.replace(/[\r\n]/g, " ").trim();
    if (text.length < 1 || text.length > MAX_REDEEM_TEXT) return null;
    return text;
}

export function promptsForText(reward: ViewerReward): boolean {
    return reward.kind === "custom" && reward.requiresText;
}

export function redeemRequestBody(rewardId: number, text?: string): string {
    return text === undefined
        ? JSON.stringify({ rewardId })
        : JSON.stringify({ rewardId, text });
}

export function parseChipBalance(raw: string | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    if (trimmed === "" || /[^0-9.,'\s  ]/.test(trimmed)) return null;
    const digits = trimmed.replace(/[^0-9]/g, "");
    if (digits === "") return null;
    const value = Number(digits);
    return Number.isSafeInteger(value) ? value : null;
}

export function canAfford(cost: number, balance: number | null): boolean {
    return balance === null || cost <= balance;
}
