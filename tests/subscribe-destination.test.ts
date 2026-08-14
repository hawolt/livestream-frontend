import { describe, expect, test } from "bun:test";
import { loginModalSignupHref, postLoginRedirectTarget, subscriptionDestination } from "../src/live/subscribe-destination.ts";

describe("subscriptionDestination", () => {
    test("carries the channel path as a return query param", () => {
        expect(subscriptionDestination("/alice")).toBe(
            `/dashboard/subscription?return=${encodeURIComponent("/alice")}`,
        );
    });

    test("falls back to the bare subscription url with no channel path", () => {
        expect(subscriptionDestination("")).toBe("/dashboard/subscription");
    });
});

describe("loginModalSignupHref", () => {
    test("points at the subscription tab with the channel return for the subscribe intent", () => {
        expect(loginModalSignupHref("subscribe", "https://itzon.example/live/alice", "/alice")).toBe(
            `/register?return=${encodeURIComponent(`/dashboard/subscription?return=${encodeURIComponent("/alice")}`)}`,
        );
    });

    test("returns to the current page for other intents", () => {
        expect(loginModalSignupHref("follow", "https://itzon.example/live/alice", "/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
        expect(loginModalSignupHref("chat", "https://itzon.example/live/alice", "/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
        expect(loginModalSignupHref("clip", "https://itzon.example/live/alice", "/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
    });
});

describe("postLoginRedirectTarget", () => {
    test("sends the subscribe intent to the subscription tab with the channel return", () => {
        expect(postLoginRedirectTarget("subscribe", "/alice")).toBe(
            `/dashboard/subscription?return=${encodeURIComponent("/alice")}`,
        );
    });

    test("leaves other intents on the current page", () => {
        expect(postLoginRedirectTarget("follow", "/alice")).toBeNull();
        expect(postLoginRedirectTarget("chat", "/alice")).toBeNull();
        expect(postLoginRedirectTarget("clip", "/alice")).toBeNull();
    });
});
