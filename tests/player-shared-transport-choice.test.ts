import { describe, expect, test } from "bun:test";
import { chooseTransport, type TransportChoice, type TransportChoiceInput } from "../src/player-shared/transport-choice.ts";

function expectedHlsFallback(input: TransportChoiceInput): TransportChoice {
    if (input.nativeHls) return "hls-native";
    if (input.hlsJsSupported) return "hls-js";
    return "unsupported";
}

function expectedNoOverride(input: TransportChoiceInput): TransportChoice {
    const wsFeasible = input.mseSupported && input.lowLatency && !input.llDenied;
    return wsFeasible ? "ws" : expectedHlsFallback(input);
}

const bools = [true, false];

describe("chooseTransport, full boolean matrix with no override", () => {
    for (const mseSupported of bools) {
        for (const nativeHls of bools) {
            for (const hlsJsSupported of bools) {
                for (const lowLatency of bools) {
                    for (const llDenied of bools) {
                        const input: TransportChoiceInput = {
                            mseSupported,
                            nativeHls,
                            hlsJsSupported,
                            lowLatency,
                            llDenied,
                            override: null,
                        };
                        test(`mse=${mseSupported} native=${nativeHls} hlsjs=${hlsJsSupported} ll=${lowLatency} denied=${llDenied}`, () => {
                            expect(chooseTransport(input)).toBe(expectedNoOverride(input));
                        });
                    }
                }
            }
        }
    }
});

describe("override handling", () => {
    test("a ws override wins when MediaSource is supported, regardless of the ll bit or prior denial", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: false, llDenied: true, override: "ws",
        })).toBe("ws");
    });

    test("a ws override falls back to the hls choice when MediaSource is unsupported", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: true, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: "ws",
        })).toBe("hls-native");
        expect(chooseTransport({
            mseSupported: false, nativeHls: false, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: "ws",
        })).toBe("hls-js");
        expect(chooseTransport({
            mseSupported: false, nativeHls: false, hlsJsSupported: false,
            lowLatency: true, llDenied: false, override: "ws",
        })).toBe("unsupported");
    });

    test("an hls override always chooses the hls fallback even when ws would otherwise qualify", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: "hls",
        })).toBe("hls-native");
        expect(chooseTransport({
            mseSupported: true, nativeHls: false, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: "hls",
        })).toBe("hls-js");
        expect(chooseTransport({
            mseSupported: true, nativeHls: false, hlsJsSupported: false,
            lowLatency: true, llDenied: false, override: "hls",
        })).toBe("unsupported");
    });

    test("an unrecognized override value is ignored and normal selection applies", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: "bogus",
        })).toBe("ws");
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: false, llDenied: false, override: "bogus",
        })).toBe("hls-native");
    });

    test("a null override runs normal selection", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: null,
        })).toBe("ws");
    });
});

describe("hls preference order", () => {
    test("hls-native is preferred over hls-js when both are available", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: true, hlsJsSupported: true,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-native");
    });

    test("hls-js is chosen when native HLS is unavailable", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: false, hlsJsSupported: true,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-js");
    });

    test("unsupported when neither hls path nor ws is available", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: false, hlsJsSupported: false,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("unsupported");
    });
});
