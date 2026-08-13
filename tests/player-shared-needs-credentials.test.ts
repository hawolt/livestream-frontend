import { expect, test } from "bun:test";
import { needsCredentials } from "../src/player-shared/needs-credentials.ts";

const PAGE_ORIGIN = "https://itzon.tv";

test("credentials ride when the request origin matches mediaBase", () => {
    expect(needsCredentials(
        "https://media.itzon.tv/hls/foo/master.m3u8?t=x",
        "https://media.itzon.tv",
        PAGE_ORIGIN,
    )).toBe(true);
});

test("credentials are withheld for a cross origin CDN request", () => {
    expect(needsCredentials(
        "https://hls.itzon.tv/hls/foo/source/live.m3u8",
        "https://media.itzon.tv",
        PAGE_ORIGIN,
    )).toBe(false);
});

test("an empty mediaBase falls back to the page origin", () => {
    expect(needsCredentials("/hls/foo/master.m3u8", "", PAGE_ORIGIN)).toBe(true);
    expect(needsCredentials("https://other.example.com/x", "", PAGE_ORIGIN)).toBe(false);
});

test("a malformed request URL withholds credentials", () => {
    expect(needsCredentials("::not a url::", "https://media.itzon.tv", PAGE_ORIGIN)).toBe(false);
});

test("differing ports on the same host are treated as different origins", () => {
    expect(needsCredentials("https://media.itzon.tv:8443/x", "https://media.itzon.tv", PAGE_ORIGIN)).toBe(false);
});

test("a relative request URL resolves against the page origin before comparison", () => {
    expect(needsCredentials("/hls/foo/master.m3u8", "https://media.itzon.tv", PAGE_ORIGIN)).toBe(false);
});
