import { describe, expect, test } from "bun:test";
import { safeNotificationHref } from "../src/notifications/link.ts";

describe("notification link", () => {
    test("keeps a same origin path", () => {
        expect(safeNotificationHref("/streamer")).toBe("/streamer");
        expect(safeNotificationHref("/dashboard/clips?id=7")).toBe("/dashboard/clips?id=7");
    });

    test("keeps an absolute http or https url", () => {
        expect(safeNotificationHref("https://itzon.tv/streamer")).toBe("https://itzon.tv/streamer");
        expect(safeNotificationHref("http://itzon.tv/streamer")).toBe("http://itzon.tv/streamer");
    });

    test("drops a script url", () => {
        expect(safeNotificationHref("javascript:alert(1)")).toBeNull();
        expect(safeNotificationHref("JavaScript:alert(1)")).toBeNull();
        expect(safeNotificationHref(" javascript:alert(1)")).toBeNull();
        expect(safeNotificationHref("data:text/html,<script>alert(1)</script>")).toBeNull();
        expect(safeNotificationHref("vbscript:msgbox(1)")).toBeNull();
    });

    test("drops a script url split by a control character", () => {
        expect(safeNotificationHref("java\nscript:alert(1)")).toBeNull();
        expect(safeNotificationHref("java\tscript:alert(1)")).toBeNull();
    });

    test("drops a protocol relative url", () => {
        expect(safeNotificationHref("//evil.example")).toBeNull();
        expect(safeNotificationHref("/\t/evil.example")).toBeNull();
    });

    test("drops a backslash that a browser reads as a slash", () => {
        expect(safeNotificationHref("/\\evil.example")).toBeNull();
        expect(safeNotificationHref("\\\\evil.example")).toBeNull();
        expect(safeNotificationHref("\\/evil.example")).toBeNull();
        expect(safeNotificationHref("/\\\\evil.example/path")).toBeNull();
    });

    test("drops a url with embedded credentials", () => {
        expect(safeNotificationHref("https://itzon.tv@evil.example/")).toBeNull();
        expect(safeNotificationHref("https://user:pass@evil.example/")).toBeNull();
    });

    test("drops empty, blank and missing values", () => {
        expect(safeNotificationHref(null)).toBeNull();
        expect(safeNotificationHref(undefined)).toBeNull();
        expect(safeNotificationHref("")).toBeNull();
        expect(safeNotificationHref("   ")).toBeNull();
        expect(safeNotificationHref("streamer")).toBeNull();
    });
});
