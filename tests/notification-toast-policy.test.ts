import { describe, expect, test } from "bun:test";
import { shouldShowToast } from "../src/notifications/toast-policy.ts";

describe("hidden tab toast rule", () => {
    test("toasts a fresh unread notification on a visible tab", () => {
        expect(shouldShowToast({ documentHidden: false, alreadyKnown: false, read: false })).toBe(true);
    });

    test("stays silent while the tab is hidden so a returning user gets no wall of toasts", () => {
        expect(shouldShowToast({ documentHidden: true, alreadyKnown: false, read: false })).toBe(false);
    });

    test("stays silent for a notification the inbox already holds", () => {
        expect(shouldShowToast({ documentHidden: false, alreadyKnown: true, read: false })).toBe(false);
    });

    test("stays silent for a notification that already counts as read", () => {
        expect(shouldShowToast({ documentHidden: false, alreadyKnown: false, read: true })).toBe(false);
    });

    test("hidden wins over every other reason to toast", () => {
        expect(shouldShowToast({ documentHidden: true, alreadyKnown: true, read: true })).toBe(false);
    });
});
