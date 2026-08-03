import { describe, expect, test } from "bun:test";
import { parseClipEmbedRoute } from "../src/clip-embed/route.ts";

describe("parseClipEmbedRoute", () => {
    test("parses a valid channel and clip code", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer/DarkMuffinScooter")).toEqual({
            channel: "streamer",
            code: "DarkMuffinScooter",
        });
    });

    test("ignores a trailing slash", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer/DarkMuffinScooter/")).toEqual({
            channel: "streamer",
            code: "DarkMuffinScooter",
        });
    });

    test("accepts underscores and dashes in the channel segment", () => {
        expect(parseClipEmbedRoute("/embed/clip/my_stream-name/AbCdEf")).toEqual({
            channel: "my_stream-name",
            code: "AbCdEf",
        });
    });

    test("rejects a channel that is too short", () => {
        expect(parseClipEmbedRoute("/embed/clip/ab/AbCdEf")).toBeNull();
    });

    test("rejects a channel that is too long", () => {
        expect(parseClipEmbedRoute(`/embed/clip/${"a".repeat(33)}/AbCdEf`)).toBeNull();
    });

    test("rejects an uppercase channel segment", () => {
        expect(parseClipEmbedRoute("/embed/clip/Streamer/AbCdEf")).toBeNull();
    });

    test("rejects a code that starts with a digit", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer/1bCdEf")).toBeNull();
    });

    test("rejects a code that is too short", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer/AbCde")).toBeNull();
    });

    test("rejects a code that is too long", () => {
        expect(parseClipEmbedRoute(`/embed/clip/streamer/A${"2".repeat(48)}`)).toBeNull();
    });

    test("accepts a code at the maximum allowed length", () => {
        const code = `A${"2".repeat(47)}`;
        expect(parseClipEmbedRoute(`/embed/clip/streamer/${code}`)).toEqual({ channel: "streamer", code });
    });

    test("rejects a plain embed username route", () => {
        expect(parseClipEmbedRoute("/embed/streamer")).toBeNull();
    });

    test("rejects a route missing the clip code segment", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer")).toBeNull();
    });

    test("rejects a route with extra trailing segments", () => {
        expect(parseClipEmbedRoute("/embed/clip/streamer/AbCdEf/extra")).toBeNull();
    });

    test("rejects a route missing the embed prefix", () => {
        expect(parseClipEmbedRoute("/streamer/clip/AbCdEf")).toBeNull();
    });
});
