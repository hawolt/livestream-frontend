import { describe, expect, test } from "bun:test";
import {
    admitToast,
    dismissToast,
    holdToastTimer,
    MAX_VISIBLE_TOASTS,
    releaseToastTimer,
    startToastTimer,
    TOAST_DISMISS_MS,
    toastTimerExpired,
    toastTimerRemaining,
} from "../src/notifications/toast-queue.ts";

describe("toast queue cap", () => {
    test("stacks up to three toasts without evicting anything", () => {
        let visible: string[] = [];
        for (const toast of ["a", "b", "c"]) {
            const admission = admitToast(visible, toast);
            expect(admission.evicted).toEqual([]);
            visible = admission.visible;
        }
        expect(visible).toEqual(["a", "b", "c"]);
        expect(visible).toHaveLength(MAX_VISIBLE_TOASTS);
    });

    test("evicts the oldest toast once the cap is reached", () => {
        const admission = admitToast(["a", "b", "c"], "d");
        expect(admission.visible).toEqual(["b", "c", "d"]);
        expect(admission.evicted).toEqual(["a"]);
    });

    test("never grows past the cap even from an oversized list", () => {
        const admission = admitToast(["a", "b", "c", "d", "e"], "f");
        expect(admission.visible).toEqual(["d", "e", "f"]);
        expect(admission.evicted).toEqual(["a", "b", "c"]);
    });

    test("honours a custom cap and treats a cap below one as one", () => {
        expect(admitToast(["a", "b"], "c", 2).visible).toEqual(["b", "c"]);
        expect(admitToast(["a"], "b", 0).visible).toEqual(["b"]);
    });

    test("dismissing removes one toast and leaves the rest in order", () => {
        expect(dismissToast(["a", "b", "c"], "b")).toEqual(["a", "c"]);
        expect(dismissToast(["a", "b"], "z")).toEqual(["a", "b"]);
    });
});

describe("toast dismiss timer", () => {
    test("expires about six seconds after it starts", () => {
        const timer = startToastTimer(1000);
        expect(TOAST_DISMISS_MS).toBe(6000);
        expect(toastTimerExpired(timer, 1000 + TOAST_DISMISS_MS - 1)).toBe(false);
        expect(toastTimerExpired(timer, 1000 + TOAST_DISMISS_MS)).toBe(true);
    });

    test("a hold freezes the remaining time", () => {
        const held = holdToastTimer(startToastTimer(0), 2000);
        expect(held.remainingMs).toBe(4000);
        expect(toastTimerExpired(held, 1_000_000)).toBe(false);
    });

    test("releasing a hold resumes from the frozen remainder", () => {
        const held = holdToastTimer(startToastTimer(0), 2000);
        const resumed = releaseToastTimer(held, 10_000);
        expect(toastTimerRemaining(resumed, 12_000)).toBe(2000);
        expect(toastTimerExpired(resumed, 13_999)).toBe(false);
        expect(toastTimerExpired(resumed, 14_000)).toBe(true);
    });

    test("hover and focus holds overlap and only the last release resumes", () => {
        let timer = startToastTimer(0);
        timer = holdToastTimer(timer, 1000);
        timer = holdToastTimer(timer, 1500);
        expect(timer.holds).toBe(2);

        timer = releaseToastTimer(timer, 5000);
        expect(timer.holds).toBe(1);
        expect(timer.runningSince).toBeNull();

        timer = releaseToastTimer(timer, 5000);
        expect(timer.holds).toBe(0);
        expect(toastTimerRemaining(timer, 9_999)).toBe(1);
        expect(toastTimerExpired(timer, 10_000)).toBe(true);
    });
});
