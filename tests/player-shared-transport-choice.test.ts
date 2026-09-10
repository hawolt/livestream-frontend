import { describe, expect, test } from "bun:test";
import { chooseTransport } from "../src/player-shared/transport-choice.ts";

describe("chooseTransport", () => {
    test("hls-js is preferred over hls-native when both are available", () => {
        expect(chooseTransport({ nativeHls: true, hlsJsSupported: true })).toBe("hls-js");
    });

    test("hls-native is chosen when hls.js is unavailable", () => {
        expect(chooseTransport({ nativeHls: true, hlsJsSupported: false })).toBe("hls-native");
    });

    test("hls-js is chosen when native HLS is unavailable", () => {
        expect(chooseTransport({ nativeHls: false, hlsJsSupported: true })).toBe("hls-js");
    });

    test("unsupported when neither hls path is available", () => {
        expect(chooseTransport({ nativeHls: false, hlsJsSupported: false })).toBe("unsupported");
    });

    test("Edge on Windows: native HLS reports support, but hls.js wins so the level API stays available", () => {
        expect(chooseTransport({ nativeHls: true, hlsJsSupported: true })).toBe("hls-js");
    });

    test("iPhone Safari: no hls.js, native HLS is the only option", () => {
        expect(chooseTransport({ nativeHls: true, hlsJsSupported: false })).toBe("hls-native");
    });
});
