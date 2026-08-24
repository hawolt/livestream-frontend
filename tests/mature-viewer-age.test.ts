import { afterEach, beforeEach, describe, expect, test } from "bun:test";

interface FetchCall {
    url: string;
    credentials: string;
}

const calls: FetchCall[] = [];
const storageWrites: string[] = [];
const cookieWrites: string[] = [];

const stubStorage = {
    getItem(): string | null {
        return null;
    },
    setItem(key: string): void {
        storageWrites.push(key);
    },
    removeItem(key: string): void {
        storageWrites.push(key);
    },
};

const stubDocument = {
    get cookie(): string {
        return "";
    },
    set cookie(value: string) {
        cookieWrites.push(value);
    },
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

function stubFetch(url: string, init?: { credentials?: string }): Promise<unknown> {
    calls.push({ url, credentials: init?.credentials ?? "" });
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ birthYear: new Date().getFullYear() - 30 }),
    });
}

beforeEach(() => {
    for (const key of ["document", "localStorage", "sessionStorage", "fetch"]) saved[key] = globals[key];
    globals["document"] = stubDocument;
    globals["localStorage"] = stubStorage;
    globals["sessionStorage"] = stubStorage;
    globals["fetch"] = stubFetch;
});

afterEach(() => {
    for (const key of ["document", "localStorage", "sessionStorage", "fetch"]) globals[key] = saved[key];
});

const { confirmMatureViewer, matureConfirmed, viewerAge } = await import("../src/mature.ts");

describe("viewer age lookup", () => {
    test("reads the age from the session terms endpoint with credentials", async () => {
        expect(await viewerAge()).toBe("adult");
        expect(calls).toEqual([{ url: "/api/main/v1/auth/terms", credentials: "include" }]);
    });

    test("is resolved once per page, not per call site", async () => {
        await viewerAge();
        await viewerAge();
        expect(calls.length).toBe(1);
    });

    test("stores nothing on the device", () => {
        expect(storageWrites).toEqual([]);
        expect(cookieWrites).toEqual([]);
    });
});

describe("interstitial confirmation", () => {
    test("starts unconfirmed and is confirmed in memory only", () => {
        expect(matureConfirmed()).toBe(false);
        confirmMatureViewer();
        expect(matureConfirmed()).toBe(true);
        expect(storageWrites).toEqual([]);
        expect(cookieWrites).toEqual([]);
    });
});
