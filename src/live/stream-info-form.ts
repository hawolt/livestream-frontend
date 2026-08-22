export const STREAM_INFO_TITLE_MAX = 200;
export const STREAM_INFO_UNSPECIFIED_LANGUAGE = "und";

export interface StreamInfoFormInput {
    title: string;
    categoryId: number | null;
    language: string;
}

export function joinStreamInfoLanguages(primary: string, secondary: string): string {
    const codes = [primary, secondary].filter(
        (code, i, all) => code !== STREAM_INFO_UNSPECIFIED_LANGUAGE && all.indexOf(code) === i,
    );
    return codes.length ? codes.join(",") : STREAM_INFO_UNSPECIFIED_LANGUAGE;
}

export interface StreamInfoFormPayload {
    title: string;
    categoryId: number | null;
    language: string;
}

export type StreamInfoFormResult =
    | { ok: true; payload: StreamInfoFormPayload }
    | { ok: false; error: string };

export function validateStreamInfoForm(input: StreamInfoFormInput): StreamInfoFormResult {
    const title = input.title.trim();
    if (title.length > STREAM_INFO_TITLE_MAX) {
        return { ok: false, error: `Title too long (max ${STREAM_INFO_TITLE_MAX} chars)` };
    }
    return { ok: true, payload: { title, categoryId: input.categoryId, language: input.language } };
}
