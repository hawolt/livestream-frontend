export type OverlayFontKey = "roboto" | "sans" | "serif" | "mono" | "condensed" | "handwriting";

const OVERLAY_FONT_STACKS: Record<OverlayFontKey, string> = {
    roboto: `"Roboto", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`,
    sans: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
    serif: `Georgia, "Times New Roman", Times, serif`,
    mono: `Consolas, "SF Mono", Menlo, Monaco, "Courier New", monospace`,
    condensed: `Impact, "Arial Narrow", "Franklin Gothic Medium", sans-serif`,
    handwriting: `"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive`,
};

export function parseOverlayFont(raw: string | null): string | undefined {
    if (raw === null) return undefined;
    return Object.prototype.hasOwnProperty.call(OVERLAY_FONT_STACKS, raw)
        ? OVERLAY_FONT_STACKS[raw as OverlayFontKey]
        : undefined;
}
