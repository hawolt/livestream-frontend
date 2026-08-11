import { describe, expect, test } from "bun:test";
import { canStartPrewarm, joinAction, type PrewarmStartConditions } from "../src/live/player/handover-decision.ts";

function conditions(overrides: Partial<PrewarmStartConditions> = {}): PrewarmStartConditions {
    return {
        transportKind: "ws",
        mediaSourceSupported: true,
        terminal: false,
        target: "targetchannel",
        currentUsername: "hawolt",
        ...overrides,
    };
}

describe("canStartPrewarm", () => {
    test("allows prewarm on the WS transport with MediaSource support", () => {
        expect(canStartPrewarm(conditions())).toBe(true);
    });

    test("refuses on the HLS transport", () => {
        expect(canStartPrewarm(conditions({ transportKind: "hls" }))).toBe(false);
    });

    test("refuses when no transport is active", () => {
        expect(canStartPrewarm(conditions({ transportKind: "none" }))).toBe(false);
    });

    test("refuses without MediaSource support", () => {
        expect(canStartPrewarm(conditions({ mediaSourceSupported: false }))).toBe(false);
    });

    test("refuses on a terminal player", () => {
        expect(canStartPrewarm(conditions({ terminal: true }))).toBe(false);
    });

    test("refuses an empty target", () => {
        expect(canStartPrewarm(conditions({ target: "" }))).toBe(false);
    });

    test("refuses a raid to the channel already being watched", () => {
        expect(canStartPrewarm(conditions({ target: "hawolt" }))).toBe(false);
    });
});

describe("joinAction", () => {
    test("swaps only when the session is ready for the same target", () => {
        expect(joinAction("ready", "targetchannel", "targetchannel")).toBe("swap");
    });

    test("navigates while the prewarm is still pending", () => {
        expect(joinAction("pending", "targetchannel", "targetchannel")).toBe("navigate");
    });

    test("navigates when the prewarm died", () => {
        expect(joinAction("dead", "targetchannel", "targetchannel")).toBe("navigate");
    });

    test("navigates when no prewarm exists", () => {
        expect(joinAction("idle", "", "targetchannel")).toBe("navigate");
    });

    test("navigates when the ready session is for a different target", () => {
        expect(joinAction("ready", "otherchannel", "targetchannel")).toBe("navigate");
    });

    test("navigates on an empty target", () => {
        expect(joinAction("ready", "", "")).toBe("navigate");
    });
});
