import { describe, expect, test } from "bun:test";
import { resolveFollowResponse } from "../src/live/follow-wire.ts";

describe("resolveFollowResponse follow intent", () => {
    test("reads following and notify from a normal JSON body", () => {
        const result = resolveFollowResponse(
            { ok: true, status: 200, bodyText: JSON.stringify({ following: true, notify: false, count: 3 }) },
            { kind: "follow" },
        );
        expect(result).toEqual({ kind: "follow", following: true, notify: false });
    });

    test("treats a 204 with an empty body as success with the intended state", () => {
        const result = resolveFollowResponse({ ok: true, status: 204, bodyText: "" }, { kind: "follow" });
        expect(result).toEqual({ kind: "follow", following: true, notify: true });
    });

    test("treats an ok response with unparseable junk as success with the intended state", () => {
        const result = resolveFollowResponse({ ok: true, status: 200, bodyText: "not json" }, { kind: "follow" });
        expect(result).toEqual({ kind: "follow", following: true, notify: true });
    });

    test("unfollow intent falls back to following false on a bodiless ok response", () => {
        const result = resolveFollowResponse({ ok: true, status: 204, bodyText: "" }, { kind: "unfollow" });
        expect(result).toEqual({ kind: "follow", following: false, notify: true });
    });

    test("unfollow intent still reads a real body when one is present", () => {
        const result = resolveFollowResponse(
            { ok: true, status: 200, bodyText: JSON.stringify({ following: false }) },
            { kind: "unfollow" },
        );
        expect(result).toEqual({ kind: "follow", following: false, notify: true });
    });

    test("maps 401 to login-required regardless of body", () => {
        const result = resolveFollowResponse({ ok: false, status: 401, bodyText: "" }, { kind: "follow" });
        expect(result).toEqual({ kind: "login-required" });
    });

    test("maps a genuine failure status to error", () => {
        const result = resolveFollowResponse({ ok: false, status: 500, bodyText: "" }, { kind: "follow" });
        expect(result).toEqual({ kind: "error" });
    });
});

describe("resolveFollowResponse notify intent", () => {
    test("reads notify from a normal JSON body", () => {
        const result = resolveFollowResponse(
            { ok: true, status: 200, bodyText: JSON.stringify({ notify: true }) },
            { kind: "notify", enabled: true },
        );
        expect(result).toEqual({ kind: "notify", notify: true });
    });

    test("treats a 204 with an empty body as success with the intended state", () => {
        const result = resolveFollowResponse({ ok: true, status: 204, bodyText: "" }, { kind: "notify", enabled: true });
        expect(result).toEqual({ kind: "notify", notify: true });
    });

    test("treats an ok response with unparseable junk as success with the intended state", () => {
        const result = resolveFollowResponse({ ok: true, status: 200, bodyText: "<html>gateway</html>" }, { kind: "notify", enabled: false });
        expect(result).toEqual({ kind: "notify", notify: false });
    });

    test("maps 401 to login-required", () => {
        const result = resolveFollowResponse({ ok: false, status: 401, bodyText: "" }, { kind: "notify", enabled: true });
        expect(result).toEqual({ kind: "login-required" });
    });

    test("maps a genuine failure status to error", () => {
        const result = resolveFollowResponse({ ok: false, status: 500, bodyText: "" }, { kind: "notify", enabled: true });
        expect(result).toEqual({ kind: "error" });
    });
});
