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

export const HANDLE_PX = 10;

export const BLOCK_MIN_WIDTH: Record<ActivityBlockId, number> = {
    stats: 260,
    activity: 300,
    info: 320,
    chat: 320,
};

export const BLOCK_MIN_HEIGHT: Record<ActivityBlockId, number> = {
    stats: 110,
    activity: 150,
    info: 150,
    chat: 240,
};

function isActivityBlockId(v: unknown): v is ActivityBlockId {
    return typeof v === "string" && (ACTIVITY_BLOCK_IDS as readonly string[]).includes(v);
}

function isValidOrder(v: unknown): v is ActivityBlockId[] {
    if (!Array.isArray(v) || v.length !== ACTIVITY_BLOCK_IDS.length) return false;
    if (!v.every(isActivityBlockId)) return false;
    return new Set(v).size === ACTIVITY_BLOCK_IDS.length;
}

function isFiniteNumberTuple(v: unknown, length: number): v is number[] {
    return Array.isArray(v) && v.length === length && v.every(x => typeof x === "number" && Number.isFinite(x));
}

export function clampWeight(value: number): number {
    if (!Number.isFinite(value)) return ACTIVITY_WEIGHT_MIN;
    return Math.min(ACTIVITY_WEIGHT_MAX, Math.max(ACTIVITY_WEIGHT_MIN, value));
}

export function colMinsFor(order: ActivityBlockId[]): [number, number] {
    const wideId = order[0] ?? "chat";
    const narrowIds = order.slice(1);
    const wide = BLOCK_MIN_WIDTH[wideId];
    const narrow = narrowIds.reduce((max, id) => Math.max(max, BLOCK_MIN_WIDTH[id]), 0);
    return [wide, narrow];
}

export function rowMinsFor(order: ActivityBlockId[]): [number, number, number] {
    const first = order[1] ?? "stats";
    const second = order[2] ?? "info";
    const third = order[3] ?? "activity";
    return [BLOCK_MIN_HEIGHT[first], BLOCK_MIN_HEIGHT[second], BLOCK_MIN_HEIGHT[third]];
}

export function clampAxisWeights(weights: number[], mins: number[], total: number): number[] {
    const minTotal = mins.reduce((a, b) => a + b, 0);
    const safeTotal = Math.max(total, 0);
    if (safeTotal <= minTotal) {
        if (minTotal <= 0) return mins.slice();
        const scale = safeTotal / minTotal;
        return mins.map(m => m * scale);
    }
    const rawTotal = weights.reduce((a, b) => a + Math.max(b, 0), 0);
    const surplus = safeTotal - minTotal;
    if (rawTotal <= 0) return mins.map(m => m + surplus / weights.length);
    return mins.map((m, i) => m + (Math.max(weights[i]!, 0) / rawTotal) * surplus);
}

export function clampColWeights(weights: [number, number], order: ActivityBlockId[], total: number): [number, number] {
    const [a, b] = clampAxisWeights(weights, colMinsFor(order), total);
    return [a!, b!];
}

export function clampRowWeights(
    weights: [number, number, number], order: ActivityBlockId[], total: number,
): [number, number, number] {
    const [a, b, c] = clampAxisWeights(weights, rowMinsFor(order), total);
    return [a!, b!, c!];
}

function clampStoredAxisWeights(weights: number[], mins: number[]): number[] {
    const total = weights.reduce((a, b) => a + b, 0);
    const minTotal = mins.reduce((a, b) => a + b, 0);
    if (total < minTotal) return weights;
    return clampAxisWeights(weights, mins, total);
}

export function clampStoredColWeights(weights: [number, number], order: ActivityBlockId[]): [number, number] {
    const [a, b] = clampStoredAxisWeights(weights, colMinsFor(order));
    return [a!, b!];
}

export function clampStoredRowWeights(
    weights: [number, number, number], order: ActivityBlockId[],
): [number, number, number] {
    const [a, b, c] = clampStoredAxisWeights(weights, rowMinsFor(order));
    return [a!, b!, c!];
}

export function parseActivityLayout(raw: unknown): ActivityLayoutState | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (!isValidOrder(data["order"])) return null;
    if (!isFiniteNumberTuple(data["colWeights"], 2)) return null;
    if (!isFiniteNumberTuple(data["rowWeights"], 3)) return null;
    const order = data["order"] as ActivityBlockId[];
    const colWeights = (data["colWeights"] as number[]).map(clampWeight) as [number, number];
    const rowWeights = (data["rowWeights"] as number[]).map(clampWeight) as [number, number, number];
    return {
        order,
        colWeights: clampStoredColWeights(colWeights, order),
        rowWeights: clampStoredRowWeights(rowWeights, order),
    };
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
