export interface PointsNameValidation {
    ok: boolean;
    value: string;
    error: string | null;
}

const POINTS_NAME_PATTERN = /^[A-Za-z0-9 ]{2,24}$/;

export function validatePointsName(raw: string): PointsNameValidation {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: "", error: null };
    if (!POINTS_NAME_PATTERN.test(trimmed)) {
        return { ok: false, value: trimmed, error: "Use 2 to 24 letters, digits and spaces, or leave blank to clear." };
    }
    return { ok: true, value: trimmed, error: null };
}
