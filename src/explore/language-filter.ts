import { streamLanguageCodes } from "../stream-languages.ts";
import type { ExploreStream } from "./context.ts";

export function filterStreamsByLanguage(list: ExploreStream[], code: string): ExploreStream[] {
    if (!code) return list;
    return list.filter((s) => streamLanguageCodes(s.language).includes(code));
}
