import { afterEach, describe, expect, test } from "bun:test";

let importSeq = 0;
async function freshCaptchaModule() {
    importSeq++;
    return import(`../src/captcha.ts?case=${importSeq}`);
}

interface StubResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}

function okJson(body: unknown): StubResponse {
    return { ok: true, status: 200, json: async () => body };
}

function failResponse(status: number): StubResponse {
    return { ok: false, status, json: async () => ({}) };
}

function mockFetch(handlers: Record<string, () => StubResponse | Promise<never>>): { url: string }[] {
    const calls: { url: string }[] = [];
    const stub = (async (url: string) => {
        calls.push({ url });
        for (const key of Object.keys(handlers)) {
            if (url.includes(key)) return handlers[key]!();
        }
        throw new Error(`unexpected fetch url: ${url}`);
    }) as unknown as typeof fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = stub;
    return calls;
}

const realDateNow = Date.now;
const realFetch = globalThis.fetch;

afterEach(() => {
    Date.now = realDateNow;
    globalThis.fetch = realFetch;
});

describe("captcha token caching", () => {
    test("reuses a cached token within its validity window", async () => {
        const calls = mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => okJson({ token: "tok-1", ttl: 1800 }),
        });
        let now = 1_000_000_000_000;
        Date.now = () => now;

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("tok-1");
        expect(calls.length).toBe(2);

        now += 1000 * 1000;
        expect(await mod.getCaptchaToken()).toBe("tok-1");
        expect(calls.length).toBe(2);
    });

    test("refetches once the cached token has expired", async () => {
        let tokenCount = 0;
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => {
                tokenCount++;
                return okJson({ token: `tok-${tokenCount}`, ttl: 1800 });
            },
        });
        let now = 1_000_000_000_000;
        Date.now = () => now;

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("tok-1");

        now += 1800 * 1000 + 1000;
        expect(await mod.getCaptchaToken()).toBe("tok-2");
        expect(tokenCount).toBe(2);
    });

    test("treats a token inside the 60 second safety buffer as already expired", async () => {
        let tokenCount = 0;
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => {
                tokenCount++;
                return okJson({ token: `tok-${tokenCount}`, ttl: 120 });
            },
        });
        let now = 1_000_000_000_000;
        Date.now = () => now;

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("tok-1");

        now += (120 - 30) * 1000;
        expect(await mod.getCaptchaToken()).toBe("tok-2");
        expect(tokenCount).toBe(2);
    });

    test("concurrent callers share one in-flight mint request", async () => {
        let tokenCount = 0;
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => {
                tokenCount++;
                return okJson({ token: "tok-1", ttl: 1800 });
            },
        });

        const mod = await freshCaptchaModule();
        const [a, b] = await Promise.all([mod.getCaptchaToken(), mod.getCaptchaToken()]);
        expect(a).toBe("tok-1");
        expect(b).toBe("tok-1");
        expect(tokenCount).toBe(1);
    });
});

describe("captcha fail-open behavior", () => {
    test("a config fetch failure fails open without ever requesting a token", async () => {
        const calls = mockFetch({
            "/captcha/config": () => {
                throw new Error("network down");
            },
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("");
        expect(calls.length).toBe(1);
    });

    test("a token mint network failure fails open to an empty token", async () => {
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => {
                throw new Error("network down");
            },
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("");
        expect(await mod.captchaQuery()).toBe("");
    });

    test("a non-ok token response fails open to an empty token", async () => {
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => failResponse(500),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("");
    });

    test("captcha disabled entirely returns an empty token without requesting one", async () => {
        const calls = mockFetch({
            "/captcha/config": () => okJson({ enabled: false, challenge: false, sitekey: "" }),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("");
        expect(calls.length).toBe(1);
    });

    test("a config carrying legacy challenge and sitekey fields ignores them and mints normally", async () => {
        const calls = mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: true, sitekey: "legacy" }),
            "/captcha/token": () => okJson({ token: "tok-1", ttl: 1800 }),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("tok-1");
        expect(calls.length).toBe(2);
    });
});

describe("captchaQuery", () => {
    test("appends an encoded token parameter when a token is available", async () => {
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => okJson({ token: "tok with space", ttl: 1800 }),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.captchaQuery()).toBe(`&t=${encodeURIComponent("tok with space")}`);
    });
});

describe("freshCaptchaQuery", () => {
    test("mints a new token even when a cached token is still valid", async () => {
        let tokenCount = 0;
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => {
                tokenCount++;
                return okJson({ token: `tok-${tokenCount}`, ttl: 1800 });
            },
        });

        const mod = await freshCaptchaModule();
        expect(await mod.getCaptchaToken()).toBe("tok-1");
        expect(await mod.freshCaptchaQuery()).toBe("&t=tok-2");
        expect(tokenCount).toBe(2);
    });

    test("returns an empty query when captcha is disabled", async () => {
        const calls = mockFetch({
            "/captcha/config": () => okJson({ enabled: false, challenge: false, sitekey: "" }),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.freshCaptchaQuery()).toBe("");
        expect(calls.length).toBe(1);
        expect(mod.captchaRequired()).toBe(false);
    });

    test("reports captcha required and an empty query when the fresh mint fails", async () => {
        mockFetch({
            "/captcha/config": () => okJson({ enabled: true, challenge: false, sitekey: "" }),
            "/captcha/token": () => failResponse(500),
        });

        const mod = await freshCaptchaModule();
        expect(await mod.freshCaptchaQuery()).toBe("");
        expect(mod.captchaRequired()).toBe(true);
    });
});
