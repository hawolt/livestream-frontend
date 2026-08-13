import { expect, test } from "bun:test";
import { parseViewerClaim } from "../src/player-shared/viewer-claim.ts";

test("q 0 through 5 decode to the documented claim and low latency pairs", () => {
    expect(parseViewerClaim("100.nonce.0.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("100.nonce.1.sig")).toEqual({ claim: 0, lowLatency: true });
    expect(parseViewerClaim("100.nonce.2.sig")).toEqual({ claim: 2, lowLatency: false });
    expect(parseViewerClaim("100.nonce.3.sig")).toEqual({ claim: 2, lowLatency: true });
    expect(parseViewerClaim("100.nonce.4.sig")).toEqual({ claim: 4, lowLatency: false });
    expect(parseViewerClaim("100.nonce.5.sig")).toEqual({ claim: 4, lowLatency: true });
});

test("legacy 3 part tokens decode to claim 0 with no low latency", () => {
    expect(parseViewerClaim("100.nonce.sig")).toEqual({ claim: 0, lowLatency: false });
});

test("malformed tokens default defensively to claim 0 and no low latency", () => {
    expect(parseViewerClaim("100.nonce.6.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("100.nonce.-1.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("100.nonce.q.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("100.nonce.02.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("100.nonce.2.5.sig")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("onlyonepart")).toEqual({ claim: 0, lowLatency: false });
    expect(parseViewerClaim("a.b")).toEqual({ claim: 0, lowLatency: false });
});

test("a null token defaults defensively to claim 0 and no low latency", () => {
    expect(parseViewerClaim(null)).toEqual({ claim: 0, lowLatency: false });
});
