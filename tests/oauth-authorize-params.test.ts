import { describe, expect, test } from "bun:test";
import { buildDenyRedirect, isValidRedirectUri, parseAuthorizeParams } from "../src/oauth-authorize/params.ts";

const CLIENT_ID = "abcdef0123456789abcdef0123456789";
const REDIRECT = "https://app.example.com/cb";

function search(overrides: Record<string, string | null> = {}): string {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        response_type: "code",
        scope: "identity",
        state: "xyz",
    });
    for (const [key, value] of Object.entries(overrides)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
    }
    return `?${params.toString()}`;
}

describe("parseAuthorizeParams", () => {
    test("accepts a fully valid request", () => {
        const parsed = parseAuthorizeParams(search());
        expect(parsed).toEqual({
            clientId: CLIENT_ID,
            redirectUri: REDIRECT,
            responseType: "code",
            scope: "identity",
            state: "xyz",
        });
    });

    test("defaults scope to identity and state to empty", () => {
        const parsed = parseAuthorizeParams(search({ scope: null, state: null }));
        expect(parsed?.scope).toBe("identity");
        expect(parsed?.state).toBe("");
    });

    test("rejects a missing or malformed client_id", () => {
        expect(parseAuthorizeParams(search({ client_id: null }))).toBeNull();
        expect(parseAuthorizeParams(search({ client_id: "short" }))).toBeNull();
        expect(parseAuthorizeParams(search({ client_id: CLIENT_ID.toUpperCase() }))).toBeNull();
    });

    test("rejects a missing or non-http redirect_uri", () => {
        expect(parseAuthorizeParams(search({ redirect_uri: null }))).toBeNull();
        expect(parseAuthorizeParams(search({ redirect_uri: "not a url" }))).toBeNull();
        expect(parseAuthorizeParams(search({ redirect_uri: "javascript:alert(1)" }))).toBeNull();
        expect(parseAuthorizeParams(search({ redirect_uri: "ftp://a.example/cb" }))).toBeNull();
    });

    test("rejects a redirect_uri carrying a fragment", () => {
        expect(parseAuthorizeParams(search({ redirect_uri: `${REDIRECT}#frag` }))).toBeNull();
    });

    test("rejects a response_type other than code", () => {
        expect(parseAuthorizeParams(search({ response_type: null }))).toBeNull();
        expect(parseAuthorizeParams(search({ response_type: "token" }))).toBeNull();
    });

    test("rejects an unknown scope", () => {
        expect(parseAuthorizeParams(search({ scope: "email" }))).toBeNull();
        expect(parseAuthorizeParams(search({ scope: "identity email" }))).toBeNull();
    });

    test("rejects an oversized state", () => {
        expect(parseAuthorizeParams(search({ state: "x".repeat(513) }))).toBeNull();
        expect(parseAuthorizeParams(search({ state: "x".repeat(512) }))).not.toBeNull();
    });
});

describe("isValidRedirectUri", () => {
    test("accepts http and https URLs", () => {
        expect(isValidRedirectUri("https://app.example.com/cb")).toBeTrue();
        expect(isValidRedirectUri("http://localhost:8080/cb")).toBeTrue();
    });

    test("rejects empty, relative, fragment and non-http values", () => {
        expect(isValidRedirectUri("")).toBeFalse();
        expect(isValidRedirectUri("/relative")).toBeFalse();
        expect(isValidRedirectUri("https://a.example/cb#x")).toBeFalse();
        expect(isValidRedirectUri("javascript:alert(1)")).toBeFalse();
    });
});

describe("buildDenyRedirect", () => {
    test("appends error with question mark on a bare URL", () => {
        expect(buildDenyRedirect(REDIRECT, "xyz")).toBe(`${REDIRECT}?error=access_denied&state=xyz`);
    });

    test("appends with ampersand when a query exists", () => {
        expect(buildDenyRedirect(`${REDIRECT}?keep=1`, "xyz")).toBe(`${REDIRECT}?keep=1&error=access_denied&state=xyz`);
    });

    test("omits state when empty and encodes it otherwise", () => {
        expect(buildDenyRedirect(REDIRECT, "")).toBe(`${REDIRECT}?error=access_denied`);
        expect(buildDenyRedirect(REDIRECT, "a b&c")).toBe(`${REDIRECT}?error=access_denied&state=a%20b%26c`);
    });
});
