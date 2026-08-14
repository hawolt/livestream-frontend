import { describe, expect, test } from "bun:test";
import { chooseTransport, type TransportChoice, type TransportChoiceInput } from "../src/player-shared/transport-choice.ts";

function expectedHlsFallback(input: TransportChoiceInput): TransportChoice {
    if (input.hlsJsSupported) return "hls-js";
    if (input.nativeHls) return "hls-native";
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
        })).toBe("hls-js");
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
        })).toBe("hls-js");
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
        })).toBe("hls-js");
    });

    test("a null override runs normal selection", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: true, llDenied: false, override: null,
        })).toBe("ws");
    });
});

describe("hls preference order", () => {
    test("hls-js is preferred over hls-native when both are available", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: true, hlsJsSupported: true,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-js");
    });

    test("hls-native is chosen when hls.js is unavailable", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: true, hlsJsSupported: false,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-native");
    });

    test("unsupported when neither hls path nor ws is available", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: false, hlsJsSupported: false,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("unsupported");
    });

    test("Edge on Windows: MSE and native HLS both report support, but hls.js wins so the level API stays available", () => {
        expect(chooseTransport({
            mseSupported: true, nativeHls: true, hlsJsSupported: true,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-js");
    });

    test("iPhone Safari: no MSE and no hls.js, native HLS is the only option", () => {
        expect(chooseTransport({
            mseSupported: false, nativeHls: true, hlsJsSupported: false,
            lowLatency: false, llDenied: false, override: null,
        })).toBe("hls-native");
    });
});
