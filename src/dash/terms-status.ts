export interface TermsStatus {
    termsVersion: number;
    acceptedVersion: number;
    needsTerms: boolean;
    needsBirthYear: boolean;
    birthYear: number | null;
    marketingOptIn: boolean;
    minAge: number;
}

export interface TermsFlags {
    needsTerms?: boolean;
    needsBirthYear?: boolean;
}

export function needsTermsGate(flags: TermsFlags | null | undefined): boolean {
    return !!flags && (flags.needsTerms === true || flags.needsBirthYear === true);
}

export function gateIntro(flags: TermsFlags): string {
    if (flags.needsTerms && flags.needsBirthYear) {
        return "We have updated our Terms of Service and Privacy Policy, and we still need your year of birth. Confirm both to keep using your account.";
    }
    if (flags.needsTerms) {
        return "We have updated our Terms of Service and Privacy Policy. Accept the current version to keep using your account.";
    }
    return "Confirm your year of birth to keep using your account.";
}

export function ageHint(minAge: number): string {
    return `You must be at least ${minAge} years old to hold an ITZON account. We ask once and never share it.`;
}
