export type ActivityBlockId = "activity" | "stats" | "info" | "chat";

export const ACTIVITY_BLOCK_IDS: readonly ActivityBlockId[] = ["activity", "stats", "info", "chat"];

export interface ActivityLayoutState {
    order: ActivityBlockId[];
    colSizes: [number, number];
    rowSizes: [number, number, number];
}

export const ACTIVITY_LAYOUT_KEY = "activity_layout";

export const ACTIVITY_SIZE_MAX = 20000;
const FIT_EPSILON = 0.5;

export const DEFAULT_ACTIVITY_LAYOUT: ActivityLayoutState = {
    order: ["chat", "stats", "info", "activity"],
    colSizes: [820, 380],
    rowSizes: [126, 330, 388],
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
    return Array.isArray(v) && v.length === length && v.every(x => typeof x === "number" && Number.isFinite(x) && x > 0);
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

function degradeToMins(mins: number[], total: number): number[] {
    const minTotal = mins.reduce((a, b) => a + b, 0);
    if (minTotal <= 0) return mins.map(() => 0);
    const scale = Math.max(total, 0) / minTotal;
    return mins.map(m => m * scale);
}

export function fitAxisTracks(sizes: number[], mins: number[], total: number): number[] {
    const safeTotal = Math.max(total, 0);
    const currentTotal = sizes.reduce((a, b) => a + b, 0);
    const totalMatches = Math.abs(currentTotal - safeTotal) < FIT_EPSILON;
    const everyAboveMin = sizes.every((s, i) => s >= (mins[i] ?? 0) - FIT_EPSILON);
    if (totalMatches && everyAboveMin) return sizes.slice();
    const minTotal = mins.reduce((a, b) => a + b, 0);
    if (safeTotal <= minTotal) return degradeToMins(mins, safeTotal);
    const surplus = safeTotal - minTotal;
    const rawTotal = sizes.reduce((a, b) => a + Math.max(b, 0), 0);
    if (rawTotal <= 0) return mins.map(m => m + surplus / sizes.length);
    return mins.map((m, i) => m + (Math.max(sizes[i]!, 0) / rawTotal) * surplus);
}

export function fitColSizes(sizes: [number, number], order: ActivityBlockId[], total: number): [number, number] {
    const [a, b] = fitAxisTracks(sizes, colMinsFor(order), total);
    return [a!, b!];
}

export function fitRowSizes(
    sizes: [number, number, number], order: ActivityBlockId[], total: number,
): [number, number, number] {
    const [a, b, c] = fitAxisTracks(sizes, rowMinsFor(order), total);
    return [a!, b!, c!];
}

export function dragAdjustPair(sizes: number[], mins: number[], indexA: number, indexB: number, delta: number): number[] {
    const next = sizes.slice();
    const sum = sizes[indexA]! + sizes[indexB]!;
    const minA = mins[indexA]!;
    const minB = mins[indexB]!;
    const maxA = Math.max(minA, sum - minB);
    const a = Math.min(maxA, Math.max(minA, sizes[indexA]! + delta));
    next[indexA] = a;
    next[indexB] = sum - a;
    return next;
}

export function dragAdjustCols(sizes: [number, number], order: ActivityBlockId[], delta: number): [number, number] {
    const [a, b] = dragAdjustPair(sizes, colMinsFor(order), 0, 1, delta);
    return [a!, b!];
}

export function dragAdjustRows(
    sizes: [number, number, number], order: ActivityBlockId[], indexA: 0 | 1, indexB: 0 | 1 | 2, delta: number,
): [number, number, number] {
    const [a, b, c] = dragAdjustPair(sizes, rowMinsFor(order), indexA, indexB, delta);
    return [a!, b!, c!];
}

function sanitizeStoredAxisSizes(sizes: number[], mins: number[]): number[] {
    const total = sizes.reduce((a, b) => a + b, 0);
    const minTotal = mins.reduce((a, b) => a + b, 0);
    if (total < minTotal) return sizes;
    return fitAxisTracks(sizes, mins, total);
}

export function sanitizeStoredColSizes(sizes: [number, number], order: ActivityBlockId[]): [number, number] {
    const [a, b] = sanitizeStoredAxisSizes(sizes, colMinsFor(order));
    return [a!, b!];
}

export function sanitizeStoredRowSizes(
    sizes: [number, number, number], order: ActivityBlockId[],
): [number, number, number] {
    const [a, b, c] = sanitizeStoredAxisSizes(sizes, rowMinsFor(order));
    return [a!, b!, c!];
}

function boundedSize(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 1;
    return Math.min(ACTIVITY_SIZE_MAX, value);
}

export function parseActivityLayout(raw: unknown): ActivityLayoutState | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (!isValidOrder(data["order"])) return null;
    const order = data["order"] as ActivityBlockId[];
    if (!isFiniteNumberTuple(data["colSizes"], 2) || !isFiniteNumberTuple(data["rowSizes"], 3)) {
        return {
            order,
            colSizes: [DEFAULT_ACTIVITY_LAYOUT.colSizes[0], DEFAULT_ACTIVITY_LAYOUT.colSizes[1]],
            rowSizes: [DEFAULT_ACTIVITY_LAYOUT.rowSizes[0], DEFAULT_ACTIVITY_LAYOUT.rowSizes[1], DEFAULT_ACTIVITY_LAYOUT.rowSizes[2]],
        };
    }
    const colSizes = (data["colSizes"] as number[]).map(boundedSize) as [number, number];
    const rowSizes = (data["rowSizes"] as number[]).map(boundedSize) as [number, number, number];
    return {
        order,
        colSizes: sanitizeStoredColSizes(colSizes, order),
        rowSizes: sanitizeStoredRowSizes(rowSizes, order),
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
        colSizes: [state.colSizes[0], state.colSizes[1]],
        rowSizes: [state.rowSizes[0], state.rowSizes[1], state.rowSizes[2]],
    };
}
