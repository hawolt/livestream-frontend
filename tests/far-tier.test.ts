import { describe, expect, test } from "bun:test";
import {
    abrEstimateFor,
    DEFAULT_ABR_ESTIMATE_BPS,
    FAR_ABR_ESTIMATE_BPS,
    FAR_STALL_GRACE_MS,
    FAR_STARTUP_RUNWAY_S,
    stallGraceMsFor,
    startupRunwayFor,
} from "../src/live/player/far-tier.ts";

describe("stallGraceMsFor", () => {
    test("a far viewer gets longer to refill before the watchdog tears the player down", () => {
        expect(stallGraceMsFor("far", 8000)).toBe(FAR_STALL_GRACE_MS);
    });

    test("near and mid keep the base grace", () => {
        expect(stallGraceMsFor("near", 8000)).toBe(8000);
        expect(stallGraceMsFor("mid", 8000)).toBe(8000);
    });

    test("a base longer than the far grace is never shortened", () => {
        expect(stallGraceMsFor("far", 30000)).toBe(30000);
    });
});

describe("abrEstimateFor", () => {
    test("a far viewer does not rejoin at the top rendition after a stall", () => {
        expect(abrEstimateFor("far")).toBe(FAR_ABR_ESTIMATE_BPS);
        expect(FAR_ABR_ESTIMATE_BPS).toBeLessThan(DEFAULT_ABR_ESTIMATE_BPS);
    });

    test("near and mid keep the default estimate", () => {
        expect(abrEstimateFor("near")).toBe(DEFAULT_ABR_ESTIMATE_BPS);
        expect(abrEstimateFor("mid")).toBe(DEFAULT_ABR_ESTIMATE_BPS);
    });
});

describe("startupRunwayFor", () => {
    test("a far viewer buffers more before playback starts", () => {
        expect(startupRunwayFor("far", 2.5)).toBe(FAR_STARTUP_RUNWAY_S);
    });

    test("near and mid keep the base runway", () => {
        expect(startupRunwayFor("near", 2.5)).toBe(2.5);
        expect(startupRunwayFor("mid", 2.5)).toBe(2.5);
    });

    test("a base longer than the far runway is never shortened", () => {
        expect(startupRunwayFor("far", 9)).toBe(9);
    });
});
