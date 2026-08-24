import { describe, expect, test } from "bun:test";
import {
    CHAT_AD_PACING,
    chatAdClickArmed,
    chatAdDismissedUntil,
    chatAdDue,
    type ChatAdState,
} from "../src/chat/chat-ad-pacing.ts";

function state(over: Partial<ChatAdState>): ChatAdState {
    return { messagesSinceAd: 0, lastAdAt: 0, dismissedUntil: 0, inFlight: false, ...over };
}

describe("chatAdDue", () => {
    const t0 = 1_000_000;
    test("needs both thresholds", () => {
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd, true)).toBe(true);
        expect(chatAdDue(state({ messagesSinceAd: 19, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd, true)).toBe(false);
        expect(chatAdDue(state({ messagesSinceAd: 500, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd - 1, true)).toBe(false);
    });
    test("never before the first message seeds the clock", () => {
        expect(chatAdDue(state({ messagesSinceAd: 50, lastAdAt: 0 }), t0, true)).toBe(false);
    });
    test("in-flight suppresses", () => {
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, inFlight: true }), t0 + CHAT_AD_PACING.minMsSinceLastAd, true)).toBe(false);
    });
    test("a scrolled-up feed never takes an ad", () => {
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0 }), t0 + CHAT_AD_PACING.minMsSinceLastAd, false)).toBe(false);
    });
    test("a dismissal suppresses for thirty minutes and then lapses", () => {
        const due = t0 + CHAT_AD_PACING.minMsSinceLastAd;
        const dismissedUntil = chatAdDismissedUntil(t0);
        expect(dismissedUntil - t0).toBe(30 * 60_000);
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, dismissedUntil }), due, true)).toBe(false);
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, dismissedUntil }), dismissedUntil - 1, true)).toBe(false);
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, dismissedUntil }), dismissedUntil, true)).toBe(true);
    });
    test("a dismissal is not permanent for the session", () => {
        const dismissedUntil = chatAdDismissedUntil(t0);
        const later = dismissedUntil + CHAT_AD_PACING.minMsSinceLastAd;
        expect(chatAdDue(state({ messagesSinceAd: 20, lastAdAt: t0, dismissedUntil }), later, true)).toBe(true);
    });
});

describe("chatAdClickArmed", () => {
    const inserted = 5_000_000;
    test("the click target is dead for the first 600ms after insertion", () => {
        expect(chatAdClickArmed(inserted, inserted)).toBe(false);
        expect(chatAdClickArmed(inserted, inserted + 599)).toBe(false);
    });
    test("the click target arms at 600ms", () => {
        expect(chatAdClickArmed(inserted, inserted + CHAT_AD_PACING.armingMs)).toBe(true);
        expect(chatAdClickArmed(inserted, inserted + 5000)).toBe(true);
    });
    test("the arming window is 600ms", () => {
        expect(CHAT_AD_PACING.armingMs).toBe(600);
    });
});
