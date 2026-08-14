import { describe, expect, test } from "bun:test";
import { loginModalSignupHref, postLoginRedirectTarget } from "../src/live/subscribe-destination.ts";

describe("loginModalSignupHref", () => {
    test("points at the subscription tab for the subscribe intent", () => {
        expect(loginModalSignupHref("subscribe", "https://itzon.example/live/alice")).toBe(
            `/register?return=${encodeURIComponent("/dashboard/subscription")}`,
        );
    });

    test("returns to the current page for other intents", () => {
        expect(loginModalSignupHref("follow", "https://itzon.example/live/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
        expect(loginModalSignupHref("chat", "https://itzon.example/live/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
        expect(loginModalSignupHref("clip", "https://itzon.example/live/alice")).toBe(
            `/register?return=${encodeURIComponent("https://itzon.example/live/alice")}`,
        );
    });
});

describe("postLoginRedirectTarget", () => {
    test("sends the subscribe intent to the subscription tab", () => {
        expect(postLoginRedirectTarget("subscribe")).toBe("/dashboard/subscription");
    });

    test("leaves other intents on the current page", () => {
        expect(postLoginRedirectTarget("follow")).toBeNull();
        expect(postLoginRedirectTarget("chat")).toBeNull();
        expect(postLoginRedirectTarget("clip")).toBeNull();
    });
});
