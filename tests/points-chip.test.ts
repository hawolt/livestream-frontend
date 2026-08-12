import { describe, expect, test } from "bun:test";
import { viewerOwnsChannel } from "../src/live/points.ts";

describe("viewerOwnsChannel", () => {
    test("true when the session user is the channel owner regardless of case", () => {
        expect(viewerOwnsChannel({ kind: "user", username: "Alice" }, "alice")).toBe(true);
        expect(viewerOwnsChannel({ kind: "user", username: "alice" }, "alice")).toBe(true);
    });

    test("false for other viewers, admins, guests and malformed sessions", () => {
        expect(viewerOwnsChannel({ kind: "user", username: "bob" }, "alice")).toBe(false);
        expect(viewerOwnsChannel({ kind: "admin", username: "alice" }, "alice")).toBe(false);
        expect(viewerOwnsChannel(null, "alice")).toBe(false);
        expect(viewerOwnsChannel({}, "alice")).toBe(false);
        expect(viewerOwnsChannel({ kind: "user" }, "alice")).toBe(false);
        expect(viewerOwnsChannel({ kind: "user", username: 42 }, "alice")).toBe(false);
    });
});
