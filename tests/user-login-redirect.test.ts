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

const { resolveReturnUrl } = await import("../src/user-login.ts");

describe("resolveReturnUrl", () => {
    const origin = "https://itzon.example";

    test("accepts a same-origin relative path", () => {
        expect(resolveReturnUrl("/dashboard/settings?tab=billing", origin)).toBe(
            "https://itzon.example/dashboard/settings?tab=billing",
        );
    });

    test("accepts a same-origin absolute http(s) url", () => {
        expect(resolveReturnUrl("https://itzon.example/streamer/alice", origin)).toBe(
            "https://itzon.example/streamer/alice",
        );
    });

    test("falls back to null for an empty return value", () => {
        expect(resolveReturnUrl("", origin)).toBeNull();
    });

    test("rejects a cross-origin absolute url", () => {
        expect(resolveReturnUrl("https://evil.example/phish", origin)).toBeNull();
    });

    test("rejects a javascript url", () => {
        expect(resolveReturnUrl("javascript:alert(document.cookie)", origin)).toBeNull();
    });

    test("rejects a protocol-relative url that resolves off-origin", () => {
        expect(resolveReturnUrl("//evil.example/phish", origin)).toBeNull();
    });

    test("rejects a url carrying embedded credentials even on the right origin", () => {
        expect(resolveReturnUrl("https://user:pass@itzon.example/dashboard", origin)).toBeNull();
    });

    test("rejects a data url", () => {
        expect(resolveReturnUrl("data:text/html,<script>alert(1)</script>", origin)).toBeNull();
    });

    test("rejects an unparseable return value", () => {
        expect(resolveReturnUrl("http://", origin)).toBeNull();
    });
});
