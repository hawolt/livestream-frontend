import { expect, test } from "bun:test";
import {
    BLOCK_MIN_HEIGHT,
    BLOCK_MIN_WIDTH,
    DEFAULT_ACTIVITY_LAYOUT,
    clampAxisWeights,
    clampColWeights,
    clampRowWeights,
    clampWeight,
    colMinsFor,
    parseActivityLayout,
    rowMinsFor,
    swapBlocks,
    type ActivityBlockId,
} from "../src/dash/activity-layout.ts";

test("accepts a well formed layout", () => {
    const raw = {
        order: ["stats", "info", "chat", "activity"],
        colWeights: [1.5, 1],
        rowWeights: [0.5, 1, 2],
    };
    expect(parseActivityLayout(raw)).toEqual(raw as any);
});

test("accepts the shipped default layout", () => {
    expect(parseActivityLayout(DEFAULT_ACTIVITY_LAYOUT)).toEqual(DEFAULT_ACTIVITY_LAYOUT);
});

test("rejects non object input", () => {
    expect(parseActivityLayout(null)).toBeNull();
    expect(parseActivityLayout(undefined)).toBeNull();
    expect(parseActivityLayout("chat,stats,info,activity")).toBeNull();
    expect(parseActivityLayout(42)).toBeNull();
});

test("rejects an order missing a block or with an unknown id", () => {
    expect(parseActivityLayout({
        order: ["stats", "info", "chat"],
        colWeights: [1, 1],
        rowWeights: [1, 1, 1],
    })).toBeNull();
    expect(parseActivityLayout({
        order: ["stats", "info", "chat", "bogus"],
        colWeights: [1, 1],
        rowWeights: [1, 1, 1],
    })).toBeNull();
});

test("rejects a duplicate block id in order", () => {
    expect(parseActivityLayout({
        order: ["stats", "stats", "chat", "activity"],
        colWeights: [1, 1],
        rowWeights: [1, 1, 1],
    })).toBeNull();
});

test("rejects malformed weight arrays", () => {
    const order = ["stats", "info", "chat", "activity"];
    expect(parseActivityLayout({ order, colWeights: [1], rowWeights: [1, 1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: [1, 1], rowWeights: [1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: ["1", 1], rowWeights: [1, 1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: [Number.NaN, 1], rowWeights: [1, 1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: [Infinity, 1], rowWeights: [1, 1, 1] })).toBeNull();
});

test("clamps a weight outside the sane bound instead of rejecting the layout", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    const zero = parseActivityLayout({ order, colWeights: [0, 1], rowWeights: [1, 1, 1] });
    expect(zero).not.toBeNull();
    expect(zero!.colWeights[0]).toBeGreaterThan(0);

    const negative = parseActivityLayout({ order, colWeights: [-1, 1], rowWeights: [1, 1, 1] });
    expect(negative).not.toBeNull();
    expect(negative!.colWeights[0]).toBeGreaterThan(0);

    const huge = parseActivityLayout({ order, colWeights: [50000, 1], rowWeights: [1, 1, 1] });
    expect(huge).not.toBeNull();
    expect(huge!.colWeights[0]).toBeLessThan(50000);
    expect(huge!.colWeights[1]).toBeGreaterThan(0);
});

test("a persisted layout with a collapsed narrow column clamps up on load", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    const [minWide, minNarrow] = colMinsFor(order);
    const raw = { order, colWeights: [3170, 10], rowWeights: [1, 1, 1] };
    const parsed = parseActivityLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.colWeights[1]).toBeGreaterThanOrEqual(minNarrow);
    expect(parsed!.colWeights[0]).toBeGreaterThanOrEqual(minWide);
    expect(parsed!.colWeights[0] + parsed!.colWeights[1]).toBeCloseTo(3180, 5);
});

test("a persisted layout with a collapsed row clamps up on load", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const mins = rowMinsFor(order);
    const raw = { order, colWeights: [1, 1], rowWeights: [900, 5, 900] };
    const parsed = parseActivityLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.rowWeights[1]).toBeGreaterThanOrEqual(mins[1]);
    const total = parsed!.rowWeights[0] + parsed!.rowWeights[1] + parsed!.rowWeights[2];
    expect(total).toBeCloseTo(1805, 5);
});

test("rejects a stale schema from an earlier version of the key", () => {
    expect(parseActivityLayout({ left: "activity", right: ["stats", "info", "chat"] })).toBeNull();
    expect(parseActivityLayout({ order: ["stats", "info", "chat", "activity"] })).toBeNull();
});

test("clampWeight keeps values inside the allowed range", () => {
    expect(clampWeight(0)).toBeGreaterThan(0);
    expect(clampWeight(-5)).toBe(clampWeight(0));
    expect(clampWeight(50000)).toBeLessThan(50000);
    expect(clampWeight(Number.NaN)).toBe(clampWeight(0));
    expect(clampWeight(1.5)).toBe(1.5);
});

test("colMinsFor and rowMinsFor pick the occupying blocks' minimums", () => {
    expect(colMinsFor(["stats", "info", "chat", "activity"])).toEqual([
        BLOCK_MIN_WIDTH.stats,
        Math.max(BLOCK_MIN_WIDTH.info, BLOCK_MIN_WIDTH.chat, BLOCK_MIN_WIDTH.activity),
    ]);
    expect(rowMinsFor(["chat", "stats", "info", "activity"])).toEqual([
        BLOCK_MIN_HEIGHT.stats,
        BLOCK_MIN_HEIGHT.info,
        BLOCK_MIN_HEIGHT.activity,
    ]);
});

test("clampAxisWeights keeps every track at or above its minimum and preserves the total", () => {
    const mins = [100, 200];
    const result = clampAxisWeights([50, 550], mins, 600);
    expect(result[0]!).toBeGreaterThanOrEqual(mins[0]!);
    expect(result[1]!).toBeGreaterThanOrEqual(mins[1]!);
    expect(result[0]! + result[1]!).toBeCloseTo(600, 5);
});

test("clampAxisWeights at the maximum extreme leaves the sibling its minimum", () => {
    const mins = [280, 320];
    const result = clampAxisWeights([1_000_000, 1], mins, 2000);
    expect(result[1]!).toBeCloseTo(mins[1]!, 1);
    expect(result[0]!).toBeCloseTo(2000 - mins[1]!, 1);
});

test("clampAxisWeights at the minimum extreme boosts a collapsed track up to its floor", () => {
    const mins = [280, 320];
    const result = clampAxisWeights([0, 2000], mins, 2000);
    expect(result[0]!).toBeCloseTo(mins[0]!, 5);
    expect(result[1]!).toBeCloseTo(2000 - mins[0]!, 5);
});

test("clampAxisWeights degrades proportionally without going negative when the container cannot fit every minimum", () => {
    const mins = [280, 320, 240];
    const result = clampAxisWeights([1, 1, 1], mins, 300);
    expect(result.every(v => v >= 0)).toBe(true);
    expect(result[0]! + result[1]! + result[2]!).toBeCloseTo(300, 5);
    expect(result[0]! / mins[0]!).toBeCloseTo(result[1]! / mins[1]!, 5);
    expect(result[1]! / mins[1]!).toBeCloseTo(result[2]! / mins[2]!, 5);
});

test("clampColWeights and clampRowWeights are order aware and container aware", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const [colResult0, colResult1] = clampColWeights([10, 10], order, 700);
    const [minWide, minNarrow] = colMinsFor(order);
    expect(colResult0).toBeGreaterThanOrEqual(minWide);
    expect(colResult1).toBeGreaterThanOrEqual(minNarrow);

    const rowResult = clampRowWeights([1, 1, 1], order, 100);
    const rowMins = rowMinsFor(order);
    expect(rowResult.every(v => v >= 0)).toBe(true);
    expect(rowResult[0] + rowResult[1] + rowResult[2]).toBeCloseTo(100, 5);
    expect(rowMins.every(m => m > 100 / 3)).toBe(true);
});

test("swapBlocks exchanges the two positions", () => {
    const order = ["chat", "stats", "info", "activity"] as const;
    expect(swapBlocks(order.slice(), "chat", "activity")).toEqual(["activity", "stats", "info", "chat"]);
});

test("swapBlocks is a no op for an unknown id or swapping with itself", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    expect(swapBlocks(order, "chat", "chat")).toEqual(order);
    expect(swapBlocks(order, "chat", "bogus" as ActivityBlockId)).toEqual(order);
});
