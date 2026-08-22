import { afterEach, describe, expect, test } from "bun:test";
import { apiFetch, readJsonBody } from "../src/api.ts";

interface StubResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get: (name: string) => string | null };
    text: () => Promise<string>;
    json: () => Promise<unknown>;
}

function stubResponse(opts: { ok: boolean; status: number; body: string; contentLength?: string | null }): StubResponse {
    return {
        ok: opts.ok,
        status: opts.status,
        statusText: "",
        headers: { get: (name: string) => name.toLowerCase() === "content-length" ? (opts.contentLength ?? null) : null },
        text: async () => opts.body,
        json: async () => JSON.parse(opts.body),
    };
}

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function mockFetchOnce(res: StubResponse): void {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => res) as unknown as typeof fetch;
}

describe("readJsonBody", () => {
    test("returns undefined for an empty body regardless of headers", async () => {
        const res = stubResponse({ ok: true, status: 200, body: "" });
        expect(await readJsonBody(res as unknown as Response)).toBeUndefined();
    });

    test("parses a normal JSON body", async () => {
        const res = stubResponse({ ok: true, status: 200, body: '{"a":1}' });
        expect(await readJsonBody<{ a: number }>(res as unknown as Response)).toEqual({ a: 1 });
    });

    test("throws for a malformed non-empty body", async () => {
        const res = stubResponse({ ok: true, status: 200, body: "not json" });
        await expect(readJsonBody(res as unknown as Response)).rejects.toThrow();
    });
});

describe("apiFetch empty body handling", () => {
    test("resolves to undefined on a literal 204", async () => {
        mockFetchOnce(stubResponse({ ok: true, status: 204, body: "" }));
        expect(await apiFetch("/api/settings/live-notify")).toBeUndefined();
    });

    test("resolves to undefined on a chunked 2xx with an empty body and no content-length header", async () => {
        mockFetchOnce(stubResponse({ ok: true, status: 200, body: "", contentLength: null }));
        expect(await apiFetch("/api/settings")).toBeUndefined();
    });

    test("still parses a normal JSON success body", async () => {
        mockFetchOnce(stubResponse({ ok: true, status: 200, body: '{"email":"a@b.com"}' }));
        expect(await apiFetch<{ email: string }>("/api/settings")).toEqual({ email: "a@b.com" });
    });

    test("a non-ok response still throws an Error carrying its status", async () => {
        mockFetchOnce(stubResponse({ ok: false, status: 403, body: '{"error":"nope"}' }));
        try {
            await apiFetch("/api/settings");
            throw new Error("expected apiFetch to throw");
        } catch (e) {
            expect(e instanceof Error).toBe(true);
            expect((e as Error).message).toBe("nope");
            expect((e as Error & { status: number }).status).toBe(403);
        }
    });
});
