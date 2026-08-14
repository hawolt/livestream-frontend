import { describe, expect, test } from "bun:test";

(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};
(globalThis as unknown as { window: unknown }).window = {
    addEventListener: () => {},
};

const { safeChannelReturnPath } = await import("../src/dash/tabs/subscription.ts");

describe("safeChannelReturnPath", () => {
    test("accepts a plain channel path", () => {
        expect(safeChannelReturnPath("/alice")).toBe("/alice");
        expect(safeChannelReturnPath("/a_b-c9")).toBe("/a_b-c9");
    });

    test("rejects missing input", () => {
        expect(safeChannelReturnPath(null)).toBeNull();
        expect(safeChannelReturnPath(undefined)).toBeNull();
        expect(safeChannelReturnPath("")).toBeNull();
    });

    test("rejects a value with a protocol", () => {
        expect(safeChannelReturnPath("https://evil.example/alice")).toBeNull();
        expect(safeChannelReturnPath("javascript:alert(1)")).toBeNull();
    });

    test("rejects a protocol-relative path", () => {
        expect(safeChannelReturnPath("//evil.example")).toBeNull();
    });

    test("rejects a path with dots", () => {
        expect(safeChannelReturnPath("/../admin")).toBeNull();
        expect(safeChannelReturnPath("/alice.bob")).toBeNull();
    });

    test("rejects a path with a query string", () => {
        expect(safeChannelReturnPath("/alice?x=1")).toBeNull();
    });

    test("rejects a path outside the channel name shape", () => {
        expect(safeChannelReturnPath("/ab")).toBeNull();
        expect(safeChannelReturnPath("/" + "a".repeat(33))).toBeNull();
        expect(safeChannelReturnPath("alice")).toBeNull();
        expect(safeChannelReturnPath("/alice/bob")).toBeNull();
    });
});
