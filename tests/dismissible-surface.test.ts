import { describe, expect, test } from "bun:test";
import { createDismissibleSurfaceStack } from "../src/dismissible-surface.ts";

describe("dismissible surface stack", () => {
    test("dismisses only the most recently opened active surface", () => {
        const stack = createDismissibleSurfaceStack();
        const dismissed: string[] = [];
        const first = {};
        const second = {};
        stack.open(first, () => dismissed.push("first"));
        stack.open(second, () => dismissed.push("second"));

        stack.takeTop()?.();

        expect(dismissed).toEqual(["second"]);
        expect(stack.size()).toBe(1);
        stack.takeTop()?.();
        expect(dismissed).toEqual(["second", "first"]);
    });

    test("reopening a surface moves it to the top without duplicating it", () => {
        const stack = createDismissibleSurfaceStack();
        const dismissed: string[] = [];
        const first = {};
        const second = {};
        stack.open(first, () => dismissed.push("old first"));
        stack.open(second, () => dismissed.push("second"));
        stack.open(first, () => dismissed.push("new first"));

        expect(stack.size()).toBe(2);
        stack.takeTop()?.();
        stack.takeTop()?.();
        expect(dismissed).toEqual(["new first", "second"]);
    });

    test("skips closed and inactive surfaces", () => {
        const stack = createDismissibleSurfaceStack();
        const dismissed: string[] = [];
        const closed = {};
        const inactive = {};
        const active = {};
        stack.open(active, () => dismissed.push("active"));
        stack.open(closed, () => dismissed.push("closed"));
        stack.close(closed);
        stack.open(inactive, () => dismissed.push("inactive"), () => false);

        stack.takeTop()?.();

        expect(dismissed).toEqual(["active"]);
        expect(stack.size()).toBe(0);
    });
});
