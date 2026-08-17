import { describe, expect, test } from "bun:test";
import { parseChatClipUrl } from "../src/chat/clip-link.ts";

const HOST = "itzon.tv";

describe("parseChatClipUrl", () => {
    test("matches the channel clip page", () => {
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/AbCdEf12", HOST))
            .toEqual({ channel: "hawolt", code: "AbCdEf12" });
    });

    test("matches the embed clip page", () => {
        expect(parseChatClipUrl("https://itzon.tv/embed/clip/hawolt/AbCdEf12", HOST))
            .toEqual({ channel: "hawolt", code: "AbCdEf12" });
    });

    test("lowercases the channel but preserves clip code case", () => {
        expect(parseChatClipUrl("https://itzon.tv/HaWolt/clip/AbCdEf12", HOST))
            .toEqual({ channel: "hawolt", code: "AbCdEf12" });
    });

    test("keeps matching when a query string or hash is attached", () => {
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/AbCdEf12?t=5#x", HOST))
            .toEqual({ channel: "hawolt", code: "AbCdEf12" });
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/AbCdEf12/", HOST))
            .toEqual({ channel: "hawolt", code: "AbCdEf12" });
    });

    test("refuses any other host", () => {
        for (const hostile of [
            "https://evil.example/hawolt/clip/AbCdEf12",
            "https://itzon.tv.evil.example/hawolt/clip/AbCdEf12",
            "https://eviltzon.tv/hawolt/clip/AbCdEf12",
            "https://itzon.tv:8443/hawolt/clip/AbCdEf12",
        ]) {
            expect(parseChatClipUrl(hostile, HOST)).toBeNull();
        }
    });

    test("refuses non http schemes", () => {
        expect(parseChatClipUrl("javascript:alert(1)", HOST)).toBeNull();
        expect(parseChatClipUrl("data:text/html,x", HOST)).toBeNull();
    });

    test("refuses paths that are not clip routes", () => {
        for (const path of [
            "https://itzon.tv/hawolt",
            "https://itzon.tv/hawolt/clips/AbCdEf12",
            "https://itzon.tv/hawolt/clip/AbCdEf12/extra",
            "https://itzon.tv/embed/clip/hawolt",
            "https://itzon.tv/clip/AbCdEf12",
        ]) {
            expect(parseChatClipUrl(path, HOST)).toBeNull();
        }
    });

    test("refuses malformed channels and clip codes", () => {
        expect(parseChatClipUrl("https://itzon.tv/ab/clip/AbCdEf12", HOST)).toBeNull();
        expect(parseChatClipUrl("https://itzon.tv/ha.wolt/clip/AbCdEf12", HOST)).toBeNull();
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/1AbCdEf", HOST)).toBeNull();
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/Ab12", HOST)).toBeNull();
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/Ab-Cd-Ef", HOST)).toBeNull();
    });

    test("refuses everything when the host is unknown", () => {
        expect(parseChatClipUrl("https://itzon.tv/hawolt/clip/AbCdEf12", "")).toBeNull();
    });
});
