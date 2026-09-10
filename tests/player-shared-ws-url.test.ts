import { expect, test } from "bun:test";
import { toWsOrigin } from "../src/player-shared/ws-url.ts";

test("rewrites an https base to wss", () => {
    expect(toWsOrigin("https://chat.example.com", "https:")).toBe("wss://chat.example.com");
});

test("rewrites an http base to ws rather than wss", () => {
    expect(toWsOrigin("http://chat.example.com", "https:")).toBe("ws://chat.example.com");
});

test("rewrites a protocol-relative base using the page protocol", () => {
    expect(toWsOrigin("//chat.example.com", "https:")).toBe("wss://chat.example.com");
    expect(toWsOrigin("//chat.example.com", "http:")).toBe("ws://chat.example.com");
});

test("leaves an already-ws base untouched", () => {
    expect(toWsOrigin("wss://chat.example.com", "https:")).toBe("wss://chat.example.com");
    expect(toWsOrigin("ws://chat.example.com", "https:")).toBe("ws://chat.example.com");
});

test("leaves an unrecognized base untouched", () => {
    expect(toWsOrigin("chat.example.com", "https:")).toBe("chat.example.com");
});
