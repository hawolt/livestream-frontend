import { expect, test } from "bun:test";
import {
    ACTIVITY_SIZE_MAX,
    BLOCK_MIN_HEIGHT,
    BLOCK_MIN_WIDTH,
    DEFAULT_ACTIVITY_LAYOUT,
    HANDLE_PX,
    colMinsFor,
    dragAdjustCols,
    dragAdjustPair,
    dragAdjustRows,
    fitAxisTracks,
    fitColSizes,
    fitRowSizes,
    parseActivityLayout,
    rowMinsFor,
    swapBlocks,
    type ActivityBlockId,
} from "../src/dash/activity-layout.ts";

test("accepts a well formed layout", () => {
    const raw = {
        order: ["stats", "info", "chat", "activity"],
        colSizes: [700, 400],
        rowSizes: [200, 300, 400],
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
        colSizes: [700, 400],
        rowSizes: [200, 300, 400],
    })).toBeNull();
    expect(parseActivityLayout({
        order: ["stats", "info", "chat", "bogus"],
        colSizes: [700, 400],
        rowSizes: [200, 300, 400],
    })).toBeNull();
});

test("rejects a duplicate block id in order", () => {
    expect(parseActivityLayout({
        order: ["stats", "stats", "chat", "activity"],
        colSizes: [700, 400],
        rowSizes: [200, 300, 400],
    })).toBeNull();
});

test("rejects a stale schema from an earlier version of the key", () => {
    expect(parseActivityLayout({ left: "activity", right: ["stats", "info", "chat"] })).toBeNull();
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

test("swapBlocks exchanges the two positions", () => {
    const order = ["chat", "stats", "info", "activity"] as const;
    expect(swapBlocks(order.slice(), "chat", "activity")).toEqual(["activity", "stats", "info", "chat"]);
});

test("swapBlocks is a no op for an unknown id or swapping with itself", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    expect(swapBlocks(order, "chat", "chat")).toEqual(order);
    expect(swapBlocks(order, "chat", "bogus" as ActivityBlockId)).toEqual(order);
});

test("fitAxisTracks keeps every track at or above its minimum and fills the total", () => {
    const mins = [100, 200];
    const result = fitAxisTracks([50, 550], mins, 600);
    expect(result[0]!).toBeGreaterThanOrEqual(mins[0]!);
    expect(result[1]!).toBeGreaterThanOrEqual(mins[1]!);
    expect(result[0]! + result[1]!).toBeCloseTo(600, 5);
});

test("fitAxisTracks degrades proportionally without going negative when the container cannot fit every minimum", () => {
    const mins = [280, 320, 240];
    const result = fitAxisTracks([1, 1, 1], mins, 300);
    expect(result.every(v => v >= 0)).toBe(true);
    expect(result[0]! + result[1]! + result[2]!).toBeCloseTo(300, 5);
    expect(result[0]! / mins[0]!).toBeCloseTo(result[1]! / mins[1]!, 5);
    expect(result[1]! / mins[1]!).toBeCloseTo(result[2]! / mins[2]!, 5);
});

test("fitAxisTracks is a no op once the tracks already sum to the requested total", () => {
    const mins = [110, 150];
    const sizes = [340.4, 511.6];
    const result = fitAxisTracks(sizes, mins, sizes[0]! + sizes[1]!);
    expect(result).toEqual(sizes);
});

test("apply is idempotent: the reported drift across four re-applies does not reproduce", () => {
    const mins = [110, 150, 150];
    const total = 780 - 20;
    const startingWeights = [0.55, 1, 1.6];

    const apply1 = fitAxisTracks(startingWeights, mins, total);
    const apply2 = fitAxisTracks(apply1, mins, total);
    const apply3 = fitAxisTracks(apply2, mins, total);
    const apply4 = fitAxisTracks(apply3, mins, total);

    expect(apply2).toEqual(apply1);
    expect(apply3).toEqual(apply1);
    expect(apply4).toEqual(apply1);
});

test("apply is idempotent through the row size wrapper with the shipped default order", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const total = 780 - 20;
    const first = fitRowSizes(DEFAULT_ACTIVITY_LAYOUT.rowSizes, order, total);
    const second = fitRowSizes(first, order, total);
    expect(second).toEqual(first);
    expect(fitRowSizes(second, order, total)).toEqual(first);
});

test("the default rows land untouched on a 1080p viewport and leave stream info room to finish", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const total = 864 - HANDLE_PX * 2;
    const [stats, info, activity] = fitRowSizes(DEFAULT_ACTIVITY_LAYOUT.rowSizes, order, total);
    expect([stats, info, activity]).toEqual(DEFAULT_ACTIVITY_LAYOUT.rowSizes);
    expect(stats).toBeLessThan(150);
    expect(info).toBeGreaterThanOrEqual(315);
});

test("apply is idempotent through the col size wrapper with the shipped default order", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const total = 1200 - 10;
    const first = fitColSizes(DEFAULT_ACTIVITY_LAYOUT.colSizes, order, total);
    const second = fitColSizes(first, order, total);
    expect(second).toEqual(first);
});

test("fitAxisTracks only redistributes when the requested total actually changed", () => {
    const mins = [110, 150, 150];
    const sizes = [200, 300, 400];
    const untouchedTotal = fitAxisTracks(sizes, mins, 900);
    expect(untouchedTotal).toEqual(sizes);
    const grown = fitAxisTracks(sizes, mins, 1000);
    expect(grown).not.toEqual(sizes);
    expect(grown[0]! + grown[1]! + grown[2]!).toBeCloseTo(1000, 5);
});

test("dragAdjustPair moves exactly the two adjacent tracks and preserves their sum", () => {
    const mins = [110, 150, 150];
    const sizes = [200, 300, 400];
    const result = dragAdjustPair(sizes, mins, 0, 1, 40);
    expect(result[0]).toBeCloseTo(240, 5);
    expect(result[1]).toBeCloseTo(260, 5);
    expect(result[0]! + result[1]!).toBeCloseTo(sizes[0]! + sizes[1]!, 5);
});

test("dragAdjustPair leaves every non adjacent track byte identical", () => {
    const mins = [110, 150, 150];
    const sizes = [200, 300, 400];
    const result = dragAdjustPair(sizes, mins, 0, 1, 40);
    expect(result[2]).toBe(sizes[2]);

    const resultOther = dragAdjustPair(sizes, mins, 1, 2, -30);
    expect(resultOther[0]).toBe(sizes[0]);
});

test("dragAdjustCols leaves the row axis untouched entirely, dragAdjustRows leaves the col axis untouched entirely", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const colSizes: [number, number] = [820, 380];
    const rowSizes: [number, number, number] = [160, 290, 460];

    const draggedCols = dragAdjustCols(colSizes, order, 25);
    expect(draggedCols[0] + draggedCols[1]).toBeCloseTo(colSizes[0] + colSizes[1], 5);
    expect(rowSizes).toEqual([160, 290, 460]);

    const draggedRows = dragAdjustRows(rowSizes, order, 1, 2, -25);
    expect(draggedRows[0]).toBe(rowSizes[0]);
    expect(colSizes).toEqual([820, 380]);
});

test("a drag that would push a track below its minimum stops instead of stealing from a third track", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const mins = rowMinsFor(order);
    const sizes: [number, number, number] = [160, 290, 460];

    const hugeDelta = -10000;
    const result = dragAdjustRows(sizes, order, 0, 1, hugeDelta);
    expect(result[0]).toBeCloseTo(mins[0], 5);
    expect(result[1]).toBeCloseTo(sizes[0] + sizes[1] - mins[0], 5);
    expect(result[2]).toBe(sizes[2]);

    const hugePositive = 10000;
    const resultOther = dragAdjustRows(sizes, order, 0, 1, hugePositive);
    expect(resultOther[1]).toBeCloseTo(mins[1], 5);
    expect(resultOther[0]).toBeCloseTo(sizes[0] + sizes[1] - mins[1], 5);
    expect(resultOther[2]).toBe(sizes[2]);
});

test("fitColSizes and fitRowSizes are order aware and container aware", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    const [colResult0, colResult1] = fitColSizes([10, 10], order, 700);
    const [minWide, minNarrow] = colMinsFor(order);
    expect(colResult0).toBeGreaterThanOrEqual(minWide);
    expect(colResult1).toBeGreaterThanOrEqual(minNarrow);

    const rowResult = fitRowSizes([1, 1, 1], order, 100);
    const rowMins = rowMinsFor(order);
    expect(rowResult.every(v => v >= 0)).toBe(true);
    expect(rowResult[0] + rowResult[1] + rowResult[2]).toBeCloseTo(100, 5);
    expect(rowMins.every(m => m > 100 / 3)).toBe(true);
});

test("a persisted layout in the new schema with a collapsed track sanitizes up to the minimum on load", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    const [minWide, minNarrow] = colMinsFor(order);
    const raw = { order, colSizes: [3170, 10], rowSizes: [300, 300, 300] };
    const parsed = parseActivityLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.colSizes[1]).toBeGreaterThanOrEqual(minNarrow);
    expect(parsed!.colSizes[0]).toBeGreaterThanOrEqual(minWide);
    expect(parsed!.colSizes[0] + parsed!.colSizes[1]).toBeCloseTo(3180, 5);
});

test("a value above the sane maximum is clamped rather than rejecting the whole layout", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    const raw = { order, colSizes: [ACTIVITY_SIZE_MAX * 5, 400], rowSizes: [300, 300, 300] };
    const parsed = parseActivityLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.colSizes[0]).toBeLessThanOrEqual(ACTIVITY_SIZE_MAX);
});

test("migration: a layout persisted under the old ratio weight schema keeps its order and falls back to default sizes", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    const drifted = { order, colWeights: [205.6, 283.5], rowWeights: [201.5, 281.3, 297.2] };
    const parsed = parseActivityLayout(drifted);
    expect(parsed).not.toBeNull();
    expect(parsed!.order).toEqual(order);
    expect(parsed!.colSizes).toEqual(DEFAULT_ACTIVITY_LAYOUT.colSizes);
    expect(parsed!.rowSizes).toEqual(DEFAULT_ACTIVITY_LAYOUT.rowSizes);
});

test("migration: a layout missing the size fields entirely still keeps its order", () => {
    const order: ActivityBlockId[] = ["activity", "chat", "info", "stats"];
    const parsed = parseActivityLayout({ order });
    expect(parsed).not.toBeNull();
    expect(parsed!.order).toEqual(order);
    expect(parsed!.colSizes).toEqual(DEFAULT_ACTIVITY_LAYOUT.colSizes);
    expect(parsed!.rowSizes).toEqual(DEFAULT_ACTIVITY_LAYOUT.rowSizes);
});

test("migration: malformed size entries (NaN, negative, wrong length) also fall back rather than rejecting the layout", () => {
    const order: ActivityBlockId[] = ["stats", "info", "chat", "activity"];
    expect(parseActivityLayout({ order, colSizes: [Number.NaN, 400], rowSizes: [300, 300, 300] })!.colSizes)
        .toEqual(DEFAULT_ACTIVITY_LAYOUT.colSizes);
    expect(parseActivityLayout({ order, colSizes: [-100, 400], rowSizes: [300, 300, 300] })!.colSizes)
        .toEqual(DEFAULT_ACTIVITY_LAYOUT.colSizes);
    expect(parseActivityLayout({ order, colSizes: [400], rowSizes: [300, 300, 300] })!.colSizes)
        .toEqual(DEFAULT_ACTIVITY_LAYOUT.colSizes);
});
