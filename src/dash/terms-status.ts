export interface TermsStatus {
    termsVersion: number;
    acceptedVersion: number;
    needsTerms: boolean;
    needsBirthDate: boolean;
    birthDate: string | null;
    marketingOptIn: boolean;
    minAge: number;
}

export interface TermsFlags {
    needsTerms?: boolean;
    needsBirthDate?: boolean;
}

export function needsTermsGate(flags: TermsFlags | null | undefined): boolean {
    return !!flags && (flags.needsTerms === true || flags.needsBirthDate === true);
}

export function gateIntro(flags: TermsFlags): string {
    if (flags.needsTerms && flags.needsBirthDate) {
        return "We have updated our Terms of Service and Privacy Policy, and we still need your date of birth. Confirm both to keep using your account.";
    }
    if (flags.needsTerms) {
        return "We have updated our Terms of Service and Privacy Policy. Accept the current version to keep using your account.";
    }
    return "Confirm your date of birth to keep using your account.";
}

export function ageHint(minAge: number): string {
    return `You must be at least ${minAge} years old to hold an ITZON account. We ask once, use it only to decide what you can see, and never share it.`;
}
