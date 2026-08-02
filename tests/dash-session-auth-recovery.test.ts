import { describe, expect, test } from "bun:test";

(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};
(globalThis as unknown as { window: unknown }).window = {
    addEventListener: () => {},
    setInterval: () => 0,
};

const { decideAuthRecovery, decideDashboardStatus } = await import("../src/dash/session.ts");

describe("decideAuthRecovery", () => {
    test("redirects to login when the cookie session is unauthenticated or identity mismatched", () => {
        expect(decideAuthRecovery("unauthenticated")).toBe("redirect");
        expect(decideAuthRecovery("mismatch")).toBe("redirect");
    });

    test("gives up without redirecting when the session endpoint is unreachable", () => {
        expect(decideAuthRecovery("unavailable")).toBe("give-up");
    });

    test("retries the original request once the cookie re-authenticates", () => {
        expect(decideAuthRecovery("authenticated")).toBe("retry");
    });
});

describe("decideDashboardStatus", () => {
    test("treats a missing response as unavailable rather than signed out", () => {
        expect(decideDashboardStatus(null)).toBe("unavailable");
    });

    test("maps 401 to signed-out and 403 to forbidden, not to a generic failure", () => {
        expect(decideDashboardStatus({ status: 401, ok: false })).toBe("signed-out");
        expect(decideDashboardStatus({ status: 403, ok: false })).toBe("forbidden");
    });

    test("treats any other non-ok status as unavailable", () => {
        expect(decideDashboardStatus({ status: 500, ok: false })).toBe("unavailable");
        expect(decideDashboardStatus({ status: 0, ok: false })).toBe("unavailable");
    });

    test("only proceeds to read the body when the response is ok", () => {
        expect(decideDashboardStatus({ status: 200, ok: true })).toBe("continue");
    });
});
