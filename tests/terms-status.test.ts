import { describe, expect, test } from "bun:test";
import { ageHint, gateIntro, needsTermsGate } from "../src/dash/terms-status.ts";

describe("needsTermsGate", () => {
    test("raises for a new terms version", () => {
        expect(needsTermsGate({ needsTerms: true, needsBirthDate: false })).toBe(true);
    });

    test("raises for a missing birth date", () => {
        expect(needsTermsGate({ needsTerms: false, needsBirthDate: true })).toBe(true);
    });

    test("stays down when both are settled", () => {
        expect(needsTermsGate({ needsTerms: false, needsBirthDate: false })).toBe(false);
    });

    test("stays down for a principal that carries no flags at all", () => {
        expect(needsTermsGate({})).toBe(false);
        expect(needsTermsGate(null)).toBe(false);
        expect(needsTermsGate(undefined)).toBe(false);
    });
});

describe("gateIntro", () => {
    test("names both when both are outstanding", () => {
        const intro = gateIntro({ needsTerms: true, needsBirthDate: true });
        expect(intro).toContain("Terms of Service");
        expect(intro).toContain("date of birth");
    });

    test("names only the terms when the birth year is already on file", () => {
        const intro = gateIntro({ needsTerms: true, needsBirthDate: false });
        expect(intro).toContain("Terms of Service");
        expect(intro).not.toContain("date of birth");
    });

    test("names only the birth date when the terms are current", () => {
        const intro = gateIntro({ needsTerms: false, needsBirthDate: true });
        expect(intro).toContain("date of birth");
        expect(intro).not.toContain("Terms of Service");
    });
});

describe("ageHint", () => {
    test("quotes the minimum age the backend reported", () => {
        expect(ageHint(13)).toContain("at least 13 years old");
    });
});
