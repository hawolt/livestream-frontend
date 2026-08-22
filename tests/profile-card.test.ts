import { afterEach, describe, expect, test } from "bun:test";
import { loadProfile } from "../src/profile-card.ts";

interface StubResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}

function okJson(body: unknown): StubResponse {
    return { ok: true, status: 200, json: async () => body };
}

function mockFetch(handler: () => StubResponse | Promise<never>): { url: string }[] {
    const calls: { url: string }[] = [];
    const stub = (async (url: string) => {
        calls.push({ url });
        return handler();
    }) as unknown as typeof fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = stub;
    return calls;
}

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

const baseBody = { username: "someone" };

describe("loadProfile channel threading", () => {
    test("fetches the plain profile url with no channel", async () => {
        const calls = mockFetch(() => okJson(baseBody));
        await loadProfile("someone");
        expect(calls[0]?.url).toBe("/api/live/profile/someone");
    });

    test("appends a channel query param when a channel is given", async () => {
        const calls = mockFetch(() => okJson(baseBody));
        await loadProfile("someone", "thechannel");
        expect(calls[0]?.url).toBe("/api/live/profile/someone?channel=thechannel");
    });

    test("url-encodes the channel", async () => {
        const calls = mockFetch(() => okJson(baseBody));
        await loadProfile("someone", "a b");
        expect(calls[0]?.url).toBe("/api/live/profile/someone?channel=a%20b");
    });
});

describe("loadProfile followingSince parsing", () => {
    test("passes through a numeric followingSince", async () => {
        mockFetch(() => okJson({ ...baseBody, followingSince: 1700000000000 }));
        const profile = await loadProfile("someone", "thechannel");
        expect(profile?.followingSince).toBe(1700000000000);
    });

    test("defaults to null when the field is missing", async () => {
        mockFetch(() => okJson(baseBody));
        const profile = await loadProfile("someone", "thechannel");
        expect(profile?.followingSince).toBeNull();
    });

    test("defaults to null when the field is explicitly null", async () => {
        mockFetch(() => okJson({ ...baseBody, followingSince: null }));
        const profile = await loadProfile("someone", "thechannel");
        expect(profile?.followingSince).toBeNull();
    });

    test("defaults to null for a malformed non-numeric value", async () => {
        mockFetch(() => okJson({ ...baseBody, followingSince: "not a date" }));
        const profile = await loadProfile("someone", "thechannel");
        expect(profile?.followingSince).toBeNull();
    });

    test("defaults to null for NaN or Infinity", async () => {
        mockFetch(() => okJson({ ...baseBody, followingSince: Number.NaN }));
        expect((await loadProfile("someone", "thechannel"))?.followingSince).toBeNull();
        mockFetch(() => okJson({ ...baseBody, followingSince: Number.POSITIVE_INFINITY }));
        expect((await loadProfile("someone", "thechannel"))?.followingSince).toBeNull();
    });

    test("never crashes when the backend does not send the field at all", async () => {
        mockFetch(() => okJson(baseBody));
        const profile = await loadProfile("someone");
        expect(profile).not.toBeNull();
        expect(profile?.followingSince).toBeNull();
    });
});
