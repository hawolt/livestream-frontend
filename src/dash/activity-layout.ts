export type ActivityBlockId = "activity" | "stats" | "info" | "chat";

export const ACTIVITY_BLOCK_IDS: readonly ActivityBlockId[] = ["activity", "stats", "info", "chat"];

export interface ActivityLayoutState {
    order: ActivityBlockId[];
    colWeights: [number, number];
    rowWeights: [number, number, number];
}

export const ACTIVITY_LAYOUT_KEY = "activity_layout";

export const ACTIVITY_WEIGHT_MIN = 0.05;
export const ACTIVITY_WEIGHT_MAX = 10000;

export const DEFAULT_ACTIVITY_LAYOUT: ActivityLayoutState = {
    order: ["chat", "stats", "info", "activity"],
    colWeights: [2.2, 1],
    rowWeights: [0.55, 1, 1.6],
};

function isActivityBlockId(v: unknown): v is ActivityBlockId {
    return typeof v === "string" && (ACTIVITY_BLOCK_IDS as readonly string[]).includes(v);
}

function isValidOrder(v: unknown): v is ActivityBlockId[] {
    if (!Array.isArray(v) || v.length !== ACTIVITY_BLOCK_IDS.length) return false;
    if (!v.every(isActivityBlockId)) return false;
    return new Set(v).size === ACTIVITY_BLOCK_IDS.length;
}

function isValidWeight(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= ACTIVITY_WEIGHT_MIN && v <= ACTIVITY_WEIGHT_MAX;
}

function isValidWeightTuple(v: unknown, length: number): boolean {
    return Array.isArray(v) && v.length === length && v.every(isValidWeight);
}

export function parseActivityLayout(raw: unknown): ActivityLayoutState | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (!isValidOrder(data["order"])) return null;
    if (!isValidWeightTuple(data["colWeights"], 2)) return null;
    if (!isValidWeightTuple(data["rowWeights"], 3)) return null;
    return {
        order: data["order"] as ActivityBlockId[],
        colWeights: data["colWeights"] as [number, number],
        rowWeights: data["rowWeights"] as [number, number, number],
    };
}

export function clampWeight(value: number): number {
    if (!Number.isFinite(value)) return ACTIVITY_WEIGHT_MIN;
    return Math.min(ACTIVITY_WEIGHT_MAX, Math.max(ACTIVITY_WEIGHT_MIN, value));
}

export function swapBlocks(order: ActivityBlockId[], a: ActivityBlockId, b: ActivityBlockId): ActivityBlockId[] {
    const next = order.slice();
    const ia = next.indexOf(a);
    const ib = next.indexOf(b);
    if (ia === -1 || ib === -1 || ia === ib) return order;
    const tmp = next[ia]!;
    next[ia] = next[ib]!;
    next[ib] = tmp;
    return next;
}

export function cloneActivityLayout(state: ActivityLayoutState): ActivityLayoutState {
    return {
        order: state.order.slice(),
        colWeights: [state.colWeights[0], state.colWeights[1]],
        rowWeights: [state.rowWeights[0], state.rowWeights[1], state.rowWeights[2]],
    };
}
