export const ADULT_AGE = 18;

export type ViewerAge = "adult" | "minor" | "unknown";
export type MatureAccess = "play" | "confirm" | "locked";

export function viewerAgeFor(birthYear: unknown, currentYear: number): ViewerAge {
    if (typeof birthYear !== "number" || !Number.isFinite(birthYear) || birthYear <= 0) return "unknown";
    if (birthYear > currentYear) return "unknown";
    return currentYear - birthYear >= ADULT_AGE ? "adult" : "minor";
}

export function matureAccess(mature: boolean, age: ViewerAge, confirmed: boolean): MatureAccess {
    if (!mature) return "play";
    if (age === "minor") return "locked";
    if (age === "adult") return "play";
    return confirmed ? "play" : "confirm";
}

export function blursMatureThumbnail(mature: boolean, age: ViewerAge): boolean {
    return mature && age !== "adult";
}
