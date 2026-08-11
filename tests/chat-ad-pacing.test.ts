import { describe, expect, test } from "bun:test";
import { CHAT_AD_PACING, chatAdDue, type ChatAdState } from "../src/chat/chat-ad-pacing.ts";

function state(over: Partial<ChatAdState>): ChatAdState {
    return { messagesSinceAd: 0, lastAdAt: 0, dismissed: false, inFlight: false, ...over };
}

describe("chatAdDue", () => {
    const t0 = 1_000_000;
    test("needs both thresholds", () => {
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd)).toBe(true);
        expect(chatAdDue(state({ messagesSinceAd: 19, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd)).toBe(false);
        expect(chatAdDue(state({ messagesSinceAd: 500, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd - 1)).toBe(false);
    });
    test("never before the first message seeds the clock", () => {
        expect(chatAdDue(state({ messagesSinceAd: 50, lastAdAt: 0 }), t0)).toBe(false);
    });
    test("dismissed and in-flight suppress", () => {
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, dismissed: true }), t0 + CHAT_AD_PACING.minMsSinceLastAd)).toBe(false);
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, inFlight: true }), t0 + CHAT_AD_PACING.minMsSinceLastAd)).toBe(false);
    });
});
