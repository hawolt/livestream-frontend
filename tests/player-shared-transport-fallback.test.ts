import { beforeEach, describe, expect, test } from "bun:test";
import {
    chooseTransportBase,
    isDirectFailed,
    markDirectFailed,
    pickTransportBase,
    resetDirectFailedForTest,
    shouldMarkDirectFailed,
} from "../src/player-shared/transport-fallback.ts";

describe("pickTransportBase", () => {
    test("prefers the direct base when present and not failed", () => {
        expect(pickTransportBase("wss://direct.example.com", "wss://fallback.example.com", false)).toEqual({
            base: "wss://direct.example.com",
            direct: true,
        });
    });

    test("falls back when the direct base already failed", () => {
        expect(pickTransportBase("wss://direct.example.com", "wss://fallback.example.com", true)).toEqual({
            base: "wss://fallback.example.com",
            direct: false,
        });
    });

    test("falls back when there is no direct base configured", () => {
        expect(pickTransportBase("", "wss://fallback.example.com", false)).toEqual({
            base: "wss://fallback.example.com",
            direct: false,
        });
    });
});

describe("shouldMarkDirectFailed", () => {
    test("is true only for a direct attempt that never joined", () => {
        expect(shouldMarkDirectFailed(true, false)).toBe(true);
    });

    test("is false once joined", () => {
        expect(shouldMarkDirectFailed(true, true)).toBe(false);
    });

    test("is false for a fallback attempt regardless of join state", () => {
        expect(shouldMarkDirectFailed(false, false)).toBe(false);
        expect(shouldMarkDirectFailed(false, true)).toBe(false);
    });
});

describe("direct-failed state transitions", () => {
    const base = "wss://state-direct.example.com";

    beforeEach(() => {
        resetDirectFailedForTest(base);
    });

    test("a fresh base is not marked failed", () => {
        expect(isDirectFailed(base)).toBe(false);
        expect(chooseTransportBase(base, "wss://fallback.example.com")).toEqual({ base, direct: true });
    });

    test("marking a base failed switches subsequent choices to the fallback", () => {
        markDirectFailed(base);
        expect(isDirectFailed(base)).toBe(true);
        expect(chooseTransportBase(base, "wss://fallback.example.com")).toEqual({
            base: "wss://fallback.example.com",
            direct: false,
        });
    });

    test("marking an empty base is a no-op", () => {
        markDirectFailed("");
        expect(isDirectFailed("")).toBe(false);
    });

    test("marking one base failed does not affect a different base", () => {
        markDirectFailed(base);
        expect(isDirectFailed("wss://other-direct.example.com")).toBe(false);
    });
});
