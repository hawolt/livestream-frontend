export type OverlaySizeStep = "s" | "l" | "xl";
export type OverlaySize = { step: OverlaySizeStep } | { px: number };

const MIN_PX = 10;
const MAX_PX = 120;

export function parseOverlaySize(raw: string | null): OverlaySize | undefined {
    if (raw === "s" || raw === "l" || raw === "xl") return { step: raw };
    if (raw === null || !/^\d+$/.test(raw)) return undefined;
    return { px: Math.min(MAX_PX, Math.max(MIN_PX, Number(raw))) };
}
