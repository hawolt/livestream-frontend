import { describe, expect, test } from "bun:test";
import { clipProcessingMessage } from "../src/clip-processing-message.ts";

const FALLBACK = "Processing your clip...";

describe("clipProcessingMessage", () => {
    test("shows queue position when queued with jobs ahead", () => {
        expect(clipProcessingMessage("queued", 3, FALLBACK)).toBe("In queue, 3 ahead");
        expect(clipProcessingMessage("queued", 1, FALLBACK)).toBe("In queue, 1 ahead");
    });

    test("shows encoding when phase is encoding regardless of queue position", () => {
        expect(clipProcessingMessage("encoding", 0, FALLBACK)).toBe("Encoding");
        expect(clipProcessingMessage("encoding", null, FALLBACK)).toBe("Encoding");
        expect(clipProcessingMessage("encoding", undefined, FALLBACK)).toBe("Encoding");
    });

    test("shows encoding when queue position is zero even if phase says queued", () => {
        expect(clipProcessingMessage("queued", 0, FALLBACK)).toBe("Encoding");
    });

    test("falls back to the generic message when both fields are absent", () => {
        expect(clipProcessingMessage(null, null, FALLBACK)).toBe(FALLBACK);
        expect(clipProcessingMessage(undefined, undefined, FALLBACK)).toBe(FALLBACK);
    });

    test("falls back to the generic message for an unrecognized phase with no queue position", () => {
        expect(clipProcessingMessage("something-else", null, FALLBACK)).toBe(FALLBACK);
    });

    test("uses the caller-supplied fallback text", () => {
        const other = "This clip is still processing. This page will update automatically.";
        expect(clipProcessingMessage(null, null, other)).toBe(other);
    });
});
