import { expect, test } from "bun:test";
import { mediaWsUrl } from "../src/player-shared/ws-url.ts";

test("uses the media base rewritten to a ws scheme when present", () => {
    expect(mediaWsUrl("https://cdn.example.com", "/ws/live?u=a", "wss://fallback.example")).toBe(
        "wss://cdn.example.com/ws/live?u=a",
    );
});

test("rewrites an http media base to ws rather than wss", () => {
    expect(mediaWsUrl("http://cdn.example.com", "/ws/live", "wss://fallback.example")).toBe(
        "ws://cdn.example.com/ws/live",
    );
});

test("falls back to the given origin when there is no media base", () => {
    expect(mediaWsUrl("", "/ws/live?u=a", "wss://fallback.example")).toBe("wss://fallback.example/ws/live?u=a");
});

test("rewrites a protocol-relative media base using the page protocol", () => {
    expect(mediaWsUrl("//cdn.example.com", "/ws/live", "wss://fallback.example", "https:")).toBe(
        "wss://cdn.example.com/ws/live",
    );
    expect(mediaWsUrl("//cdn.example.com", "/ws/live", "wss://fallback.example", "http:")).toBe(
        "ws://cdn.example.com/ws/live",
    );
});

test("leaves an already-ws media base untouched", () => {
    expect(mediaWsUrl("wss://cdn.example.com", "/ws/live", "wss://fallback.example")).toBe(
        "wss://cdn.example.com/ws/live",
    );
    expect(mediaWsUrl("ws://cdn.example.com", "/ws/live", "wss://fallback.example")).toBe(
        "ws://cdn.example.com/ws/live",
    );
});
