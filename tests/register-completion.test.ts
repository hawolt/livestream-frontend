import { describe, expect, test } from "bun:test";
import {
    consumeRegistrationCompletion,
    isValidRegistrationCompletion,
    registrationCompletionUrl,
} from "../src/register-completion.ts";

describe("registration completion handoff", () => {
    test("builds a fragment-only token handoff while preserving the return target", () => {
        expect(registrationCompletionUrl(
            "https://itzon.example/register?return=%2Fdashboard%2Fstream#theme=dark",
            "secret+/=",
            "user",
            "nonce-123",
        )).toBe(
            "https://itzon.example/register?return=%2Fdashboard%2Fstream&registration-complete=1#theme=dark&token=secret%2B%2F%3D&kind=user&state=nonce-123",
        );
    });

    test("preserves a bare fragment while building the handoff", () => {
        expect(registrationCompletionUrl(
            "https://itzon.example/register#done",
            "secret",
            "user",
            "nonce",
        )).toBe(
            "https://itzon.example/register?registration-complete=1#done&token=secret&kind=user&state=nonce",
        );
    });

    test("consumes and removes completion metadata and duplicate fragment tokens", () => {
        expect(consumeRegistrationCompletion(
            "https://itzon.example/register?return=%2Fdashboard&registration-complete=1#token=&theme=dark&token=secret&kind=user&state=nonce-123",
        )).toEqual({
            token: "secret",
            kind: "user",
            state: "nonce-123",
            replacement: "/register?return=%2Fdashboard#theme=dark",
        });
    });

    test("ignores ordinary registration URLs", () => {
        expect(consumeRegistrationCompletion("https://itzon.example/register?return=%2Fdashboard#token=unrelated"))
            .toBeNull();
    });

    test("preserves bare fragment fields while consuming a completion", () => {
        expect(consumeRegistrationCompletion(
            "https://itzon.example/register?registration-complete=1#theme&token=secret&kind=user&state=nonce",
        )).toEqual({
            token: "secret",
            kind: "user",
            state: "nonce",
            replacement: "/register#theme",
        });
    });

    test("requires a matching one-time state and a user bearer", () => {
        const completion = {
            token: "secret",
            kind: "user",
            state: "nonce",
            replacement: "/register",
        };
        expect(isValidRegistrationCompletion(completion, "nonce")).toBe(true);
        expect(isValidRegistrationCompletion(completion, "other")).toBe(false);
        expect(isValidRegistrationCompletion(completion, "")).toBe(false);
        expect(isValidRegistrationCompletion({ ...completion, token: "" }, "nonce")).toBe(false);
        expect(isValidRegistrationCompletion({ ...completion, kind: "admin" }, "nonce")).toBe(false);
    });
});
