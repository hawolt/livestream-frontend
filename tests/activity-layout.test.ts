import { expect, test } from "bun:test";
import {
    DEFAULT_ACTIVITY_LAYOUT,
    clampWeight,
    parseActivityLayout,
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

test("rejects weights outside the sane bound", () => {
    const order = ["stats", "info", "chat", "activity"];
    expect(parseActivityLayout({ order, colWeights: [0, 1], rowWeights: [1, 1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: [-1, 1], rowWeights: [1, 1, 1] })).toBeNull();
    expect(parseActivityLayout({ order, colWeights: [50000, 1], rowWeights: [1, 1, 1] })).toBeNull();
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

test("swapBlocks exchanges the two positions", () => {
    const order = ["chat", "stats", "info", "activity"] as const;
    expect(swapBlocks(order.slice(), "chat", "activity")).toEqual(["activity", "stats", "info", "chat"]);
});

test("swapBlocks is a no op for an unknown id or swapping with itself", () => {
    const order: ActivityBlockId[] = ["chat", "stats", "info", "activity"];
    expect(swapBlocks(order, "chat", "chat")).toEqual(order);
    expect(swapBlocks(order, "chat", "bogus" as ActivityBlockId)).toEqual(order);
});
