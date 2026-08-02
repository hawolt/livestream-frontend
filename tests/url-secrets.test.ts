import { describe, expect, test } from "bun:test";
import { scrubOneShotToken, scrubOverlayToken } from "../src/url-secrets.ts";

describe("scrubOneShotToken", () => {
    test("reads and removes only the token query parameter", () => {
        expect(scrubOneShotToken("https://itzon.example/reset-password?source=email&token=secret&lang=en#done")).toEqual({
            token: "secret",
            replacement: "/reset-password?source=email&lang=en#done",
        });
    });

    test("leaves URLs without a token unchanged", () => {
        expect(scrubOneShotToken("https://itzon.example/verify?source=email#status")).toEqual({
            token: "",
            replacement: null,
        });
    });

    test("uses the first non-empty token from duplicate query values", () => {
        expect(scrubOneShotToken("https://itzon.example/verify?token=&source=email&token=secret#status")).toEqual({
            token: "secret",
            replacement: "/verify?source=email#status",
        });
    });

    test("prefers and removes a fragment token while preserving other fragment state", () => {
        expect(scrubOneShotToken("https://itzon.example/verify?source=email&token=legacy#status=ready&token=current")).toEqual({
            token: "current",
            replacement: "/verify?source=email#status=ready",
        });
    });

    test("preserves a bare fragment while removing a query token", () => {
        expect(scrubOneShotToken("https://itzon.example/verify?token=secret#done")).toEqual({
            token: "secret",
            replacement: "/verify#done",
        });
    });

    test("preserves bare fragment fields while removing duplicate fragment tokens", () => {
        expect(scrubOneShotToken("https://itzon.example/verify#done&token=first&view=full&token=second")).toEqual({
            token: "first",
            replacement: "/verify#done&view=full",
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
