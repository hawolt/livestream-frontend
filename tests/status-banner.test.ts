import { expect, test } from "bun:test";
import {
    INITIAL_BANNER_STATE,
    OUTAGE_ERROR_THRESHOLD,
    bannerMessage,
    bannerSignature,
    nextBannerState,
    type BannerState,
} from "../src/status-banner.ts";

test("healthy responses keep the banner hidden and reset error count", () => {
    const errored: BannerState = { serverErrors: 2, mode: "outage", services: [] };
    const state = nextBannerState(errored, { kind: "ok", degraded: false, services: [] });
    expect(state.mode).toBe("hidden");
    expect(state.serverErrors).toBe(0);
    expect(bannerMessage(state)).toBeNull();
});

test("degraded response shows the affected services", () => {
    const state = nextBannerState(INITIAL_BANNER_STATE, {
        kind: "ok", degraded: true, services: ["Chat", "Video (Germany)"],
    });
    expect(state.mode).toBe("degraded");
    expect(bannerMessage(state)).toBe("Degraded performance: Chat, Video (Germany).");
});

test("degraded flag without services stays hidden", () => {
    const state = nextBannerState(INITIAL_BANNER_STATE, { kind: "ok", degraded: true, services: [] });
    expect(state.mode).toBe("hidden");
});

test("server errors only escalate to the outage banner after the threshold", () => {
    let state = INITIAL_BANNER_STATE;
    for (let i = 0; i < OUTAGE_ERROR_THRESHOLD - 1; i++) {
        state = nextBannerState(state, { kind: "server-error" });
        expect(state.mode).toBe("hidden");
    }
    state = nextBannerState(state, { kind: "server-error" });
    expect(state.mode).toBe("outage");
    expect(bannerMessage(state)).toContain("technical difficulties");
});

test("server errors preserve an already visible degraded banner until threshold", () => {
    let state = nextBannerState(INITIAL_BANNER_STATE, { kind: "ok", degraded: true, services: ["Chat"] });
    state = nextBannerState(state, { kind: "server-error" });
    expect(state.mode).toBe("degraded");
    expect(state.services).toEqual(["Chat"]);
});

test("network errors change nothing", () => {
    const degraded = nextBannerState(INITIAL_BANNER_STATE, { kind: "ok", degraded: true, services: ["Chat"] });
    const after = nextBannerState(degraded, { kind: "network-error" });
    expect(after).toEqual(degraded);
    expect(nextBannerState(INITIAL_BANNER_STATE, { kind: "network-error" })).toEqual(INITIAL_BANNER_STATE);
});

test("signatures distinguish different affected service sets", () => {
    const a = nextBannerState(INITIAL_BANNER_STATE, { kind: "ok", degraded: true, services: ["Chat"] });
    const b = nextBannerState(INITIAL_BANNER_STATE, { kind: "ok", degraded: true, services: ["Chat", "Payments"] });
    expect(bannerSignature(a)).not.toBe(bannerSignature(b));
});

