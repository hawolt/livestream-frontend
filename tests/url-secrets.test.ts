import { describe, expect, test } from "bun:test";
import { scrubOverlayToken, scrubQueryToken } from "../src/url-secrets.ts";

describe("scrubQueryToken", () => {
    test("reads and removes only the token query parameter", () => {
        expect(scrubQueryToken("https://itzon.example/reset-password?source=email&token=secret&lang=en#done")).toEqual({
            token: "secret",
            replacement: "/reset-password?source=email&lang=en#done",
        });
    });

    test("leaves URLs without a token unchanged", () => {
        expect(scrubQueryToken("https://itzon.example/verify?source=email#status")).toEqual({
            token: "",
            replacement: null,
        });
    });

    test("uses the first non-empty token from duplicate query values", () => {
        expect(scrubQueryToken("https://itzon.example/verify?token=&source=email&token=secret#status")).toEqual({
            token: "secret",
            replacement: "/verify?source=email#status",
        });
    });
});

describe("scrubOverlayToken", () => {
    test("prefers a fragment token and removes a legacy query token", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?size=s&token=legacy#theme=dark&token=current")).toEqual({
            token: "current",
            replacement: "/alerts/alice?size=s#theme=dark&token=current",
        });
    });

    test("migrates a legacy query token while preserving other query and fragment values", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?size=l&token=legacy&duration=6#theme=dark")).toEqual({
            token: "legacy",
            replacement: "/alerts/alice?size=l&duration=6#theme=dark&token=legacy",
        });
    });

    test("reads a fragment token without rewriting the URL", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?size=s#token=current&theme=dark")).toEqual({
            token: "current",
            replacement: null,
        });
    });

    test("uses and migrates a legacy token when the fragment token is empty", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?token=legacy#theme=dark&token=")).toEqual({
            token: "legacy",
            replacement: "/alerts/alice#theme=dark&token=legacy",
        });
    });

    test("uses the first non-empty token from duplicate fragment values", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?token=legacy#token=&theme=dark&token=current")).toEqual({
            token: "current",
            replacement: "/alerts/alice#token=&theme=dark&token=current",
        });
    });

    test("uses the first non-empty token from duplicate legacy query values", () => {
        expect(scrubOverlayToken("https://itzon.example/alerts/alice?token=&theme=dark&token=legacy#layout=stack")).toEqual({
            token: "legacy",
            replacement: "/alerts/alice?theme=dark#layout=stack&token=legacy",
        });
    });
});
