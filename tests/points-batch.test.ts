import { describe, expect, test } from "bun:test";
import { POINTS_BATCH_WINDOW_MS, PointsBatcher } from "../src/live/points-batch.ts";

type Harness = {
    flushed: number[];
    scheduled: number[];
    cancelled: number[];
    run: () => void;
    batcher: PointsBatcher;
};

function harness(): Harness {
    const flushed: number[] = [];
    const scheduled: number[] = [];
    const cancelled: number[] = [];
    let pending: (() => void) | null = null;
    let nextId = 1;
    const batcher = new PointsBatcher(
        (sum) => flushed.push(sum),
        POINTS_BATCH_WINDOW_MS,
        (fn, ms) => {
            scheduled.push(ms);
            pending = fn;
            return nextId++;
        },
        (id) => cancelled.push(id),
    );
    return {
        flushed,
        scheduled,
        cancelled,
        run: () => {
            const fn = pending;
            pending = null;
            if (fn) fn();
        },
        batcher,
    };
}

describe("PointsBatcher", () => {
    test("firstGainSchedulesOneWindow", () => {
        const h = harness();
        h.batcher.add(10);
        expect(h.scheduled).toEqual([300000]);
        h.batcher.add(10);
        expect(h.scheduled).toEqual([300000]);
        expect(h.batcher.pending()).toBe(20);
    });

    test("fireFlushesSumOnceAndResets", () => {
        const h = harness();
        h.batcher.add(10);
        h.batcher.add(10);
        h.batcher.fire();
        expect(h.flushed).toEqual([20]);
        expect(h.batcher.pending()).toBe(0);
        h.batcher.fire();
        expect(h.flushed).toEqual([20]);
    });

    test("nextGainAfterFireStartsNewWindow", () => {
        const h = harness();
        h.batcher.add(10);
        h.run();
        expect(h.flushed).toEqual([10]);
        h.batcher.add(20);
        expect(h.scheduled).toEqual([300000, 300000]);
    });

    test("zeroAndNegativeAndNaNGainsIgnored", () => {
        const h = harness();
        h.batcher.add(0);
        h.batcher.add(-5);
        h.batcher.add(NaN);
        expect(h.scheduled).toEqual([]);
        expect(h.batcher.pending()).toBe(0);
    });

    test("disposeCancelsTimerAndClearsSum", () => {
        const h = harness();
        h.batcher.add(10);
        h.batcher.dispose();
        expect(h.cancelled).toEqual([1]);
        h.batcher.fire();
        expect(h.flushed).toEqual([]);
        expect(h.batcher.pending()).toBe(0);
    });
});
