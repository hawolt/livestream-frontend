import { describe, expect, test } from "bun:test";

function autoStub(): unknown {
    const handler: ProxyHandler<() => void> = {
        get(_target, prop) {
            if (prop === "then") return undefined;
            if (prop === "toJSON") return () => undefined;
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === Symbol.iterator) return function* stubIterator() {};
            if (prop === "length") return 0;
            return autoStub();
        },
        set() {
            return true;
        },
        has() {
            return true;
        },
        apply() {
            return autoStub();
        },
        construct() {
            return autoStub() as object;
        },
    };
    return new Proxy(function stubTarget() {}, handler);
}

(globalThis as unknown as { document: unknown }).document = autoStub();
(globalThis as unknown as { window: unknown }).window = autoStub();
(globalThis as unknown as { location: unknown }).location = autoStub();
(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = autoStub();
(globalThis as unknown as { fetch: unknown }).fetch = autoStub();

const { resolveReturnUrl, loginLinkHref } = await import("../src/register.ts");

describe("register resolveReturnUrl", () => {
    const origin = "https://itzon.example";

    test("accepts a same-origin relative path", () => {
        expect(resolveReturnUrl("/dashboard/subscription", origin)).toBe(
            "https://itzon.example/dashboard/subscription",
        );
    });

    test("rejects a cross-origin absolute url", () => {
        expect(resolveReturnUrl("https://evil.example/phish", origin)).toBeNull();
    });

    test("falls back to null for an empty return value", () => {
        expect(resolveReturnUrl("", origin)).toBeNull();
    });
});

describe("register loginLinkHref", () => {
    const origin = "https://itzon.example";

    test("forwards a valid return value onto the login link", () => {
        expect(loginLinkHref("/dashboard/subscription", origin)).toBe(
            `/login?return=${encodeURIComponent("https://itzon.example/dashboard/subscription")}`,
        );
    });

    test("plain login link when there is no return value", () => {
        expect(loginLinkHref("", origin)).toBe("/login");
    });

    test("plain login link when the return value is unsafe", () => {
        expect(loginLinkHref("https://evil.example/phish", origin)).toBe("/login");
    });
});
