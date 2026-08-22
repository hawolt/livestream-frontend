export type OverlaySize = "s" | "l" | "xl";

export function parseOverlaySize(raw: string | null): OverlaySize | undefined {
    return raw === "s" || raw === "l" || raw === "xl" ? raw : undefined;
}
