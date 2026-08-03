import { describe, expect, test } from "bun:test";
import { parseClipRoute } from "../src/live/clip/route.ts";

describe("parseClipRoute", () => {
    test("parses a valid channel and clip code", () => {
        expect(parseClipRoute("/streamer/clip/DarkMuffinScooter")).toEqual({
            channel: "streamer",
            code: "DarkMuffinScooter",
        });
    });

    test("ignores a trailing slash", () => {
        expect(parseClipRoute("/streamer/clip/DarkMuffinScooter/")).toEqual({
            channel: "streamer",
            code: "DarkMuffinScooter",
        });
    });

    test("accepts underscores and dashes in the channel segment", () => {
        expect(parseClipRoute("/my_stream-name/clip/AbCdEf")).toEqual({
            channel: "my_stream-name",
            code: "AbCdEf",
        });
    });

    test("rejects a channel that is too short", () => {
        expect(parseClipRoute("/ab/clip/AbCdEf")).toBeNull();
    });

    test("rejects an uppercase channel segment", () => {
        expect(parseClipRoute("/Streamer/clip/AbCdEf")).toBeNull();
    });

    test("rejects a code that starts with a digit", () => {
        expect(parseClipRoute("/streamer/clip/1bCdEf")).toBeNull();
    });

    test("rejects a code that is too short", () => {
        expect(parseClipRoute("/streamer/clip/AbCde")).toBeNull();
    });

    test("rejects a code that is too long", () => {
        expect(parseClipRoute("/streamer/clip/A234567890123456789012345678901234567890123456789")).toBeNull();
    });

    test("accepts a code at the maximum allowed length", () => {
        const code = `A${"2".repeat(47)}`;
        expect(parseClipRoute(`/streamer/clip/${code}`)).toEqual({ channel: "streamer", code });
    });

    test("rejects a plain username route", () => {
        expect(parseClipRoute("/streamer")).toBeNull();
    });

    test("rejects a route missing the clip segment", () => {
        expect(parseClipRoute("/streamer/AbCdEf")).toBeNull();
    });

    test("rejects a route with extra trailing segments", () => {
        expect(parseClipRoute("/streamer/clip/AbCdEf/extra")).toBeNull();
    });
});
