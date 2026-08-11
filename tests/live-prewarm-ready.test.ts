import { describe, expect, test } from "bun:test";
import { prewarmReady, type PrewarmProgress } from "../src/live/player/prewarm-ready.ts";

function progress(overrides: Partial<PrewarmProgress> = {}): PrewarmProgress {
    return {
        initAppended: true,
        fragmentsAppended: 1,
        bufferedSeconds: 0.5,
        readyState: 2,
        ...overrides,
    };
}

describe("prewarmReady", () => {
    test("ready once init plus one fragment are appended and decodable data is buffered", () => {
        expect(prewarmReady(progress())).toBe(true);
    });

    test("not ready before the init segment appended", () => {
        expect(prewarmReady(progress({ initAppended: false }))).toBe(false);
    });

    test("not ready with zero media fragments", () => {
        expect(prewarmReady(progress({ fragmentsAppended: 0 }))).toBe(false);
    });

    test("not ready with nothing buffered", () => {
        expect(prewarmReady(progress({ bufferedSeconds: 0 }))).toBe(false);
    });

    test("not ready below HAVE_CURRENT_DATA", () => {
        expect(prewarmReady(progress({ readyState: 1 }))).toBe(false);
        expect(prewarmReady(progress({ readyState: 0 }))).toBe(false);
    });

    test("ready with more fragments and higher ready states", () => {
        expect(prewarmReady(progress({ fragmentsAppended: 12, readyState: 4, bufferedSeconds: 8 }))).toBe(true);
    });
});
