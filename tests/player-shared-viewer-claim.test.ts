import { expect, test } from "bun:test";
import { tokenCarriesLowLatency } from "../src/player-shared/viewer-claim.ts";

test("odd q values carry the low latency bit", () => {
    expect(tokenCarriesLowLatency("100.nonce.1.sig")).toBe(true);
    expect(tokenCarriesLowLatency("100.nonce.3.sig")).toBe(true);
    expect(tokenCarriesLowLatency("100.nonce.5.sig")).toBe(true);
});

test("even q values, legacy and malformed tokens do not", () => {
    expect(tokenCarriesLowLatency("100.nonce.0.sig")).toBe(false);
    expect(tokenCarriesLowLatency("100.nonce.2.sig")).toBe(false);
    expect(tokenCarriesLowLatency("100.nonce.sig")).toBe(false);
    expect(tokenCarriesLowLatency("100.nonce.6.sig")).toBe(false);
    expect(tokenCarriesLowLatency("100.nonce.02.sig")).toBe(false);
    expect(tokenCarriesLowLatency("")).toBe(false);
    expect(tokenCarriesLowLatency(null)).toBe(false);
});
