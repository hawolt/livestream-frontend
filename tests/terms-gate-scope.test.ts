import { describe, expect, test } from "bun:test";
import { termsGateAllowedOn } from "../src/terms-gate.ts";

describe("termsGateAllowedOn", () => {
    test("runs on the pages a signed-in viewer actually browses", () => {
        expect(termsGateAllowedOn("/")).toBe(true);
        expect(termsGateAllowedOn("/somechannel")).toBe(true);
        expect(termsGateAllowedOn("/dashboard")).toBe(true);
        expect(termsGateAllowedOn("/dashboard/stream")).toBe(true);
        expect(termsGateAllowedOn("/pricing")).toBe(true);
    });

    test("never blocks the documents it is asking people to accept", () => {
        expect(termsGateAllowedOn("/terms")).toBe(false);
        expect(termsGateAllowedOn("/privacy")).toBe(false);
        expect(termsGateAllowedOn("/impressum")).toBe(false);
    });

    test("stays off the auth pages", () => {
        expect(termsGateAllowedOn("/login")).toBe(false);
        expect(termsGateAllowedOn("/register")).toBe(false);
        expect(termsGateAllowedOn("/verify")).toBe(false);
        expect(termsGateAllowedOn("/reset-password")).toBe(false);
        expect(termsGateAllowedOn("/oauth/authorize")).toBe(false);
    });

    test("never appears inside an OBS source or an embed", () => {
        expect(termsGateAllowedOn("/chat/somechannel")).toBe(false);
        expect(termsGateAllowedOn("/alerts/somechannel")).toBe(false);
        expect(termsGateAllowedOn("/embed")).toBe(false);
        expect(termsGateAllowedOn("/embed/somechannel")).toBe(false);
    });

    test("ignores a trailing slash", () => {
        expect(termsGateAllowedOn("/terms/")).toBe(false);
        expect(termsGateAllowedOn("/")).toBe(true);
    });
});
