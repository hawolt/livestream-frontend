import { afterEach, describe, expect, test } from "bun:test";
import { parseChatWssBase } from "../src/chat/ws-config.ts";

let importSeq = 0;
async function freshWsConfigModule() {
    importSeq++;
    return import(`../src/chat/ws-config.ts?case=${importSeq}`);
}

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

describe("parseChatWssBase", () => {
    test("reads a string chatWss field", () => {
        expect(parseChatWssBase({ chatWss: "wss://chat.example.com:8443" })).toBe("wss://chat.example.com:8443");
    });

    test("returns empty for a missing chatWss field", () => {
        expect(parseChatWssBase({})).toBe("");
    });

    test("returns empty for a non-string chatWss field", () => {
        expect(parseChatWssBase({ chatWss: 5 })).toBe("");
    });

    test("returns empty for null or undefined input", () => {
        expect(parseChatWssBase(null)).toBe("");
        expect(parseChatWssBase(undefined)).toBe("");
    });
});

describe("getChatWssBase caching", () => {
    test("fetches once per page and reuses the cached value", async () => {
        const calls = mockFetch(() => okJson({ chatWss: "wss://chat.example.com:8443" }));
        const mod = await freshWsConfigModule();
        expect(await mod.getChatWssBase()).toBe("wss://chat.example.com:8443");
        expect(await mod.getChatWssBase()).toBe("wss://chat.example.com:8443");
        expect(calls.length).toBe(1);
    });

    test("a missing chatWss field resolves to an empty base", async () => {
        mockFetch(() => okJson({}));
        const mod = await freshWsConfigModule();
        expect(await mod.getChatWssBase()).toBe("");
    });

    test("a fetch failure resolves to an empty base and is retried next call", async () => {
        let calls = 0;
        mockFetch(() => {
            calls++;
            throw new Error("network down");
        });
        const mod = await freshWsConfigModule();
        expect(await mod.getChatWssBase()).toBe("");
        expect(await mod.getChatWssBase()).toBe("");
        expect(calls).toBe(2);
    });

    test("a non-ok response resolves to an empty base", async () => {
        mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
        const mod = await freshWsConfigModule();
        expect(await mod.getChatWssBase()).toBe("");
    });

    test("concurrent callers share one in-flight fetch", async () => {
        let calls = 0;
        mockFetch(() => {
            calls++;
            return okJson({ chatWss: "wss://chat.example.com:8443" });
        });
        const mod = await freshWsConfigModule();
        const [a, b] = await Promise.all([mod.getChatWssBase(), mod.getChatWssBase()]);
        expect(a).toBe("wss://chat.example.com:8443");
        expect(b).toBe("wss://chat.example.com:8443");
        expect(calls).toBe(1);
    });
});
