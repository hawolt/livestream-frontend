export const MAX_PLAUSIBLE_AGE = 120;
export const MIN_SIGNUP_AGE = 13;

export const TERMS_REQUIRED_MESSAGE = "You must accept the terms of service and the privacy policy";
export const BIRTH_DATE_REQUIRED_MESSAGE = "Your date of birth is required";
export const BIRTH_DATE_INVALID_MESSAGE = "That date does not exist";
export const BIRTH_DATE_TOO_YOUNG_MESSAGE = `You must be at least ${MIN_SIGNUP_AGE} years old to create an account`;

export type ConsentField = "terms" | "birthDate";

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export interface BirthDateParts {
    day: string;
    month: string;
    year: string;
}

export function birthYearOptions(currentYear: number): number[] {
    const years: number[] = [];
    for (let year = currentYear; year >= currentYear - MAX_PLAUSIBLE_AGE; year--) years.push(year);
    return years;
}

export function daysInMonth(month: number, year: number): number {
    if (!Number.isInteger(month) || month < 1 || month > 12) return 31;
    if (!Number.isInteger(year) || year <= 0) return month === 2 ? 29 : 31;
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoBirthDate(parts: BirthDateParts): string | null {
    const day = Number(parts.day);
    const month = Number(parts.month);
    const year = Number(parts.year);
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
    if (day < 1 || month < 1 || month > 12 || year < 1) return null;
    if (day > daysInMonth(month, year)) return null;
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(day)}`;
}

export function ageOn(iso: string, today: Date): number {
    const [year, month, day] = iso.split("-").map(Number);
    let age = today.getUTCFullYear() - year;
    const beforeBirthday = today.getUTCMonth() + 1 < month
        || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
    if (beforeBirthday) age--;
    return age;
}

export function birthDateError(parts: BirthDateParts, today: Date): string | null {
    if (!parts.day.trim() || !parts.month.trim() || !parts.year.trim()) return BIRTH_DATE_REQUIRED_MESSAGE;
    const iso = isoBirthDate(parts);
    if (iso === null) return BIRTH_DATE_INVALID_MESSAGE;
    const age = ageOn(iso, today);
    if (age < 0 || age > MAX_PLAUSIBLE_AGE) return BIRTH_DATE_INVALID_MESSAGE;
    if (age < MIN_SIGNUP_AGE) return BIRTH_DATE_TOO_YOUNG_MESSAGE;
    return null;
}

export function consentError(
    termsAccepted: boolean,
    parts: BirthDateParts,
    birthDateRequired: boolean,
    today: Date,
): string | null {
    if (!termsAccepted) return TERMS_REQUIRED_MESSAGE;
    if (birthDateRequired) return birthDateError(parts, today);
    return null;
}

export function consentFieldForMessage(message: string): ConsentField | null {
    const text = message.toLowerCase();
    if (text.includes("date of birth") || text.includes("years old") || text.includes("date does not exist")) {
        return "birthDate";
    }
    if (text.includes("terms of service")) return "terms";
    return null;
}

function option(value: string, label: string): HTMLOptionElement {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
}

export function fillDaySelect(select: HTMLSelectElement, month: number, year: number): void {
    const previous = select.value;
    const limit = daysInMonth(month, year);
    const options = [option("", "Day")];
    for (let day = 1; day <= limit; day++) options.push(option(String(day), String(day)));
    select.replaceChildren(...options);
    select.value = previous && Number(previous) <= limit ? previous : "";
}

export function fillMonthSelect(select: HTMLSelectElement): void {
    const options = [option("", "Month")];
    MONTH_NAMES.forEach((name, index) => options.push(option(String(index + 1), name)));
    select.replaceChildren(...options);
}

export function fillYearSelect(select: HTMLSelectElement, currentYear: number): void {
    const options = [option("", "Year")];
    for (const year of birthYearOptions(currentYear)) options.push(option(String(year), String(year)));
    select.replaceChildren(...options);
}

export function wireBirthDateSelects(
    daySelect: HTMLSelectElement,
    monthSelect: HTMLSelectElement,
    yearSelect: HTMLSelectElement,
    currentYear: number,
): void {
    fillMonthSelect(monthSelect);
    fillYearSelect(yearSelect, currentYear);
    fillDaySelect(daySelect, 0, 0);
    const resync = () => fillDaySelect(daySelect, Number(monthSelect.value), Number(yearSelect.value));
    monthSelect.addEventListener("change", resync);
    yearSelect.addEventListener("change", resync);
}
