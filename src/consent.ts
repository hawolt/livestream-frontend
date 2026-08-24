export const MAX_PLAUSIBLE_AGE = 120;

export const TERMS_REQUIRED_MESSAGE = "You must accept the terms of service and the privacy policy";
export const BIRTH_YEAR_REQUIRED_MESSAGE = "Your year of birth is required";

export type ConsentField = "terms" | "birthYear";

export function birthYearOptions(currentYear: number): number[] {
    const years: number[] = [];
    for (let year = currentYear; year >= currentYear - MAX_PLAUSIBLE_AGE; year--) years.push(year);
    return years;
}

export function fillBirthYearSelect(select: HTMLSelectElement, currentYear: number, placeholder: string): void {
    const options: HTMLOptionElement[] = [];
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = placeholder;
    options.push(blank);
    for (const year of birthYearOptions(currentYear)) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        options.push(option);
    }
    select.replaceChildren(...options);
}

export function consentError(termsAccepted: boolean, birthYear: string, birthYearRequired: boolean): string | null {
    if (!termsAccepted) return TERMS_REQUIRED_MESSAGE;
    if (birthYearRequired && !birthYear.trim()) return BIRTH_YEAR_REQUIRED_MESSAGE;
    return null;
}

export function consentFieldForMessage(message: string): ConsentField | null {
    const text = message.toLowerCase();
    if (text.includes("year of birth") || text.includes("years old")) return "birthYear";
    if (text.includes("terms of service")) return "terms";
    return null;
}
