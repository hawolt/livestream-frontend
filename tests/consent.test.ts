import { describe, expect, test } from "bun:test";
import {
    BIRTH_YEAR_REQUIRED_MESSAGE, MAX_PLAUSIBLE_AGE, TERMS_REQUIRED_MESSAGE,
    birthYearOptions, consentError, consentFieldForMessage,
} from "../src/consent.ts";

describe("birthYearOptions", () => {
    test("starts at the current year so the age gate stays neutral", () => {
        expect(birthYearOptions(2026)[0]).toBe(2026);
    });

    test("runs down to the oldest plausible year", () => {
        const years = birthYearOptions(2026);
        expect(years[years.length - 1]).toBe(2026 - MAX_PLAUSIBLE_AGE);
        expect(years.length).toBe(MAX_PLAUSIBLE_AGE + 1);
    });

    test("offers years a minor could pick so the backend does the rejecting", () => {
        expect(birthYearOptions(2026)).toContain(2020);
    });
});

describe("consentError", () => {
    test("terms come first", () => {
        expect(consentError(false, "", true)).toBe(TERMS_REQUIRED_MESSAGE);
        expect(consentError(false, "1990", true)).toBe(TERMS_REQUIRED_MESSAGE);
    });

    test("birth year is required when the account still has none", () => {
        expect(consentError(true, "", true)).toBe(BIRTH_YEAR_REQUIRED_MESSAGE);
        expect(consentError(true, "   ", true)).toBe(BIRTH_YEAR_REQUIRED_MESSAGE);
    });

    test("birth year is skipped when the account already has one", () => {
        expect(consentError(true, "", false)).toBeNull();
    });

    test("no error once both answers are present", () => {
        expect(consentError(true, "1990", true)).toBeNull();
    });
});

describe("consentFieldForMessage", () => {
    test("under-13 rejection points at the birth year field", () => {
        expect(consentFieldForMessage("You must be at least 13 years old to create an account")).toBe("birthYear");
    });

    test("missing and invalid birth year point at the birth year field", () => {
        expect(consentFieldForMessage(BIRTH_YEAR_REQUIRED_MESSAGE)).toBe("birthYear");
        expect(consentFieldForMessage("Enter a valid year of birth")).toBe("birthYear");
    });

    test("terms rejection points at the terms checkbox", () => {
        expect(consentFieldForMessage(TERMS_REQUIRED_MESSAGE)).toBe("terms");
    });

    test("unrelated errors point at no field", () => {
        expect(consentFieldForMessage("Username already taken")).toBeNull();
    });
});
