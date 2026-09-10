import { describe, expect, test } from "bun:test";
import { decideEmbedHealth, type EmbedHealthInput } from "../src/embed/health-decision.ts";

const base: EmbedHealthInput = {
    state: "playing",
    now: 30000,
    lastStateChangeAt: 25000,
    lastProgressAt: 25000,
    paused: false,
    staleMs: 15000,
    stuckMs: 20000,
};

describe("embed health decision", () => {
    test("restarts a connection that never becomes playable", () => {
        expect(decideEmbedHealth({
            ...base,
            state: "connecting",
            now: 21001,
            lastStateChangeAt: 1000,
        })).toBe("stuck-connecting");
    });

    test("restarts active playback when its clock stops", () => {
        expect(decideEmbedHealth({
            ...base,
            now: 41001,
            lastProgressAt: 25000,
        })).toBe("stale-progress");
    });

    test("does not treat intentional paused playback as stale progress", () => {
        expect(decideEmbedHealth({
            ...base,
            now: 41001,
            lastProgressAt: 25000,
            paused: true,
        })).toBeNull();
    });

    test("leaves healthy playback alone", () => {
        expect(decideEmbedHealth(base)).toBeNull();
    });

    test("ignores retry and offline states", () => {
        expect(decideEmbedHealth({ ...base, state: "retrying", now: 100000 })).toBeNull();
        expect(decideEmbedHealth({ ...base, state: "offline", now: 100000 })).toBeNull();
    });
});
