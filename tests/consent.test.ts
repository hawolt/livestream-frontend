import { describe, expect, test } from "bun:test";
import {
    BIRTH_DATE_INVALID_MESSAGE, BIRTH_DATE_REQUIRED_MESSAGE, BIRTH_DATE_TOO_YOUNG_MESSAGE,
    MAX_PLAUSIBLE_AGE, TERMS_REQUIRED_MESSAGE,
    ageOn, birthDateError, birthYearOptions, consentError, consentFieldForMessage,
    daysInMonth, isoBirthDate,
} from "../src/consent.ts";

const TODAY = new Date(Date.UTC(2026, 7, 24));
const parts = (day: string, month: string, year: string) => ({ day, month, year });

describe("birthYearOptions", () => {
    test("starts at the current year", () => {
        expect(birthYearOptions(2026)[0]).toBe(2026);
    });

    test("spans the plausible range", () => {
        const years = birthYearOptions(2026);
        expect(years[years.length - 1]).toBe(2026 - MAX_PLAUSIBLE_AGE);
    });
});

describe("daysInMonth", () => {
    test("knows short months", () => {
        expect(daysInMonth(4, 2026)).toBe(30);
        expect(daysInMonth(1, 2026)).toBe(31);
    });

    test("handles february in a common year and a leap year", () => {
        expect(daysInMonth(2, 2026)).toBe(28);
        expect(daysInMonth(2, 2024)).toBe(29);
    });

    test("offers 29 for february before a year is chosen", () => {
        expect(daysInMonth(2, 0)).toBe(29);
    });
});

describe("isoBirthDate", () => {
    test("pads to an ISO date", () => {
        expect(isoBirthDate(parts("3", "2", "1999"))).toBe("1999-02-03");
    });

    test("rejects a day the month does not have", () => {
        expect(isoBirthDate(parts("31", "4", "2000"))).toBeNull();
        expect(isoBirthDate(parts("29", "2", "2026"))).toBeNull();
    });

    test("accepts the leap day in a leap year", () => {
        expect(isoBirthDate(parts("29", "2", "2024"))).toBe("2024-02-29");
    });

    test("rejects an incomplete date", () => {
        expect(isoBirthDate(parts("", "2", "2000"))).toBeNull();
    });
});

describe("ageOn", () => {
    test("counts a birthday that has passed this year", () => {
        expect(ageOn("2000-01-01", TODAY)).toBe(26);
    });

    test("does not count a birthday still to come", () => {
        expect(ageOn("2000-12-31", TODAY)).toBe(25);
    });

    test("counts the birthday itself", () => {
        expect(ageOn("2000-08-24", TODAY)).toBe(26);
    });

    test("does not count the day before the birthday", () => {
        expect(ageOn("2000-08-25", TODAY)).toBe(25);
    });
});

describe("birthDateError", () => {
    test("requires every part", () => {
        expect(birthDateError(parts("", "", ""), TODAY)).toBe(BIRTH_DATE_REQUIRED_MESSAGE);
        expect(birthDateError(parts("1", "", "2000"), TODAY)).toBe(BIRTH_DATE_REQUIRED_MESSAGE);
    });

    test("rejects a date that does not exist", () => {
        expect(birthDateError(parts("31", "2", "2000"), TODAY)).toBe(BIRTH_DATE_INVALID_MESSAGE);
    });

    test("rejects a date in the future", () => {
        expect(birthDateError(parts("1", "1", "2030"), TODAY)).toBe(BIRTH_DATE_INVALID_MESSAGE);
    });

    test("rejects someone under thirteen", () => {
        expect(birthDateError(parts("1", "1", "2020"), TODAY)).toBe(BIRTH_DATE_TOO_YOUNG_MESSAGE);
    });

    test("rejects the day before the thirteenth birthday and accepts the day of it", () => {
        expect(birthDateError(parts("25", "8", "2013"), TODAY)).toBe(BIRTH_DATE_TOO_YOUNG_MESSAGE);
        expect(birthDateError(parts("24", "8", "2013"), TODAY)).toBeNull();
    });

    test("accepts an ordinary adult", () => {
        expect(birthDateError(parts("15", "6", "1990"), TODAY)).toBeNull();
    });
});

describe("consentError", () => {
    test("demands the terms first", () => {
        expect(consentError(false, parts("1", "1", "1990"), true, TODAY)).toBe(TERMS_REQUIRED_MESSAGE);
    });

    test("demands the birth date when it is still outstanding", () => {
        expect(consentError(true, parts("", "", ""), true, TODAY)).toBe(BIRTH_DATE_REQUIRED_MESSAGE);
    });

    test("skips the birth date when it is already on file", () => {
        expect(consentError(true, parts("", "", ""), false, TODAY)).toBeNull();
    });

    test("passes when both are satisfied", () => {
        expect(consentError(true, parts("15", "6", "1990"), true, TODAY)).toBeNull();
    });
});

describe("consentFieldForMessage", () => {
    test("routes the terms message", () => {
        expect(consentFieldForMessage(TERMS_REQUIRED_MESSAGE)).toBe("terms");
    });

    test("routes every birth date message", () => {
        expect(consentFieldForMessage(BIRTH_DATE_REQUIRED_MESSAGE)).toBe("birthDate");
        expect(consentFieldForMessage(BIRTH_DATE_INVALID_MESSAGE)).toBe("birthDate");
        expect(consentFieldForMessage(BIRTH_DATE_TOO_YOUNG_MESSAGE)).toBe("birthDate");
    });

    test("returns null for anything else", () => {
        expect(consentFieldForMessage("Network error")).toBeNull();
    });
});
