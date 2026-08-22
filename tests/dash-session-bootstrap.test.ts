import { afterEach, describe, expect, test } from "bun:test";

function token(payload: string): string {
    const encoded = btoa(payload)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${encoded}.signature`;
}

const VALID_TOKEN = token("user:7:0:alice:verified:100:200");

interface StubResponse {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
}

function jsonResponse(status: number, body: unknown): StubResponse {
    const text = JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => body };
}

function emptyResponse(status: number): StubResponse {
    return { ok: status >= 200 && status < 300, status, text: async () => "", json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } };
}

function malformedResponse(status: number): StubResponse {
    return { ok: status >= 200 && status < 300, status, text: async () => "not json", json: async () => { throw new SyntaxError("Unexpected token"); } };
}

function mockFetch(handlers: { session?: () => StubResponse | Promise<never>; me?: () => StubResponse | Promise<never> }): { session: number; me: number } {
    const calls = { session: 0, me: 0 };
    const stub = (async (url: string) => {
        if (url.includes("/auth/session")) {
            calls.session++;
            if (!handlers.session) throw new Error("unexpected /auth/session call");
            return handlers.session();
        }
        if (url.includes("/auth/me")) {
            calls.me++;
            if (!handlers.me) throw new Error("unexpected /auth/me call");
            return handlers.me();
        }
        throw new Error(`unexpected fetch url: ${url}`);
    }) as unknown as typeof fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = stub;
    return calls;
}

interface SessionStorageStub {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

function workingSessionStorage(): SessionStorageStub {
    return {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };
}

function sessionStorageThrowingOnSetItemCall(throwOnCall: number): SessionStorageStub {
    let calls = 0;
    return {
        getItem: () => null,
        setItem: () => {
            calls++;
            if (calls === throwOnCall) throw new Error("storage disabled");
        },
        removeItem: () => {},
    };
}

function stubEnvironment(sessionStorageStub: SessionStorageStub = workingSessionStorage()): void {
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = sessionStorageStub;
    (globalThis as unknown as { window: unknown }).window = {
        addEventListener: () => {},
        setInterval: () => 0,
    };
}

let importSeq = 0;
async function freshSessionModule(sessionStorageStub?: SessionStorageStub) {
    importSeq++;
    stubEnvironment(sessionStorageStub);
    return import(`../src/dash/session.ts?case=${importSeq}`);
}

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("session bootstrap: /auth/session failure modes", () => {
    test("a network exception talking to /auth/session is a transport failure, not a login state", async () => {
        mockFetch({ session: () => { throw new Error("network down"); } });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "unavailable" });
    });

    test("a bodiless 200 from /auth/session yields unavailable, not a crash", async () => {
        mockFetch({ session: () => emptyResponse(200) });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "unavailable" });
    });

    test("a genuine 401 from /auth/session is still unauthenticated and never calls /auth/me", async () => {
        const calls = mockFetch({ session: () => emptyResponse(401) });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "signed-out" });
        expect(calls.me).toBe(0);
    });

    test("a throwing sessionStorage.setItem while adopting the cookie token resolves to unavailable, not a rejected promise", async () => {
        mockFetch({ session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }) });
        const mod = await freshSessionModule(sessionStorageThrowingOnSetItemCall(1));
        await expect(mod.loadDashboardSession()).resolves.toEqual({ state: "unavailable" });
    });
});

describe("session bootstrap: /auth/me failure modes after a valid cookie session", () => {
    test("a malformed /auth/me body resolves to unavailable, not a thrown SyntaxError", async () => {
        mockFetch({
            session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }),
            me: () => malformedResponse(200),
        });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "unavailable" });
    });

    test("a bodiless 200 from /auth/me resolves to unavailable, not a thrown SyntaxError", async () => {
        mockFetch({
            session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }),
            me: () => emptyResponse(200),
        });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "unavailable" });
    });

    test("a genuine 401 from /auth/me is still signed-out, not unavailable", async () => {
        mockFetch({
            session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }),
            me: () => emptyResponse(401),
        });
        const mod = await freshSessionModule();
        expect(await mod.loadDashboardSession()).toEqual({ state: "signed-out" });
    });

    test("a well formed /auth/me body resolves to ready", async () => {
        mockFetch({
            session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }),
            me: () => jsonResponse(200, { id: 7, kind: "user", flags: "", emailVerified: true, username: "alice", tabs: [] }),
        });
        const mod = await freshSessionModule();
        const result = await mod.loadDashboardSession();
        expect(result.state).toBe("ready");
        expect(result.me.username).toBe("alice");
    });

    test("a throwing sessionStorage.setItem while adopting a rotated /auth/me token resolves to unavailable, not a rejected promise", async () => {
        const ROTATED_TOKEN = token("user:7:0:alice:verified:150:200");
        mockFetch({
            session: () => jsonResponse(200, { token: VALID_TOKEN, kind: "user", id: 7 }),
            me: () => jsonResponse(200, { id: 7, kind: "user", flags: "", emailVerified: true, username: "alice", tabs: [], token: ROTATED_TOKEN }),
        });
        const mod = await freshSessionModule(sessionStorageThrowingOnSetItemCall(3));
        await expect(mod.loadDashboardSession()).resolves.toEqual({ state: "unavailable" });
    });
});
